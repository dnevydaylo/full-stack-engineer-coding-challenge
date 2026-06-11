## 1. Datenmodell

**CatalogVersion** ist die Hauptentität und bezieht sich auf `(craftsmanId, trade)`. Sie speichert den `status` (`DRAFT` / `PUBLISHED`), `effectiveFrom` sowie `publishedBy` / `publishedAt` für den Audit-Trail. Ein partieller Unique-Index auf `(craftsman_id, trade) WHERE status = 'PUBLISHED'` sorgt dafür, dass nie zwei aktive Versionen gleichzeitig existieren können.

**CatalogPosition** gehört über `versionId` zur Version. Sie enthält `key`, `label`, `unit`, `netPriceCents`, `vatRate`, optionale `minQuantity` / `maxQuantity`, ein JSONB-Feld `tradeAttributes` und ein JSONB-Array `surcharges`. Zuschläge haben keine eigene Identität — sie existieren nur als Teil der Position, werden nie separat abgefragt und immer zusammen gelesen, geschrieben und gelöscht. Eine eigene Tabelle wäre overkill und würde nur unnötige JOINs produzieren.

**CatalogDiscount** gehört ebenfalls zur Version. Hat einen `type` (`flat` / `percent`), einen `value`, optionales `capCents` und `appliesTo` als JSONB (`"subtotal"` oder `{ positionKeys: string[] }`).

**Warum JSONB für `tradeAttributes`?** Die gewerke-spezifischen Attribute unterscheiden sich von Gewerk zu Gewerk komplett — ein HVAC-Installateur hat z.B. `heatingPowerKw`, ein Fensterbauer dagegen `uValue` und `frameMaterial`. Eine extra Tabelle pro Gewerk oder eine generische EAV-Tabelle würde das Schema aufblähen und Abfragen unnötig komplizieren. Mit JSONB bleibt das Ganze flexibel ohne den Rest des Schemas zu belasten.

---

## 2. Geldrepräsentation

**Gewählt: Integer in Cent.** Alle Geldbeträge werden intern als `integer` in Euro-Cent gespeichert und verrechnet. Beispiel: 150,00 € = `15000`.

Floating-Point ist für Geld einfach ungeeignet. Klassisches Beispiel: `0.1 + 0.2 = 0.30000000000000004` in JavaScript. Mit Integer-Arithmetik passiert sowas nicht — Addition und Subtraktion sind exakt.

Formatierung (`150,00 €`) findet ausschließlich am Response-Boundary statt via `Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })`. Intern wird nie formatiert.

---

## 3. Quote-Auswertungsreihenfolge

Die Berechnung läuft in drei sequenziellen Phasen:

**Phase 1 — Zuschläge pro Zeile:**

1. `lineNet = quantity × netPriceCents`
2. Flat-Zuschläge summieren: `lineNet += (flatSurcharges)`
3. Prozent-Zuschläge multiplikativ verketten: `lineNet = round(lineNet × (1+p₁) × (1+p₂) × …)`

Flat-Zuschläge kommen zuerst, damit die Prozent-Zuschläge auf dem bereits erhöhten Betrag berechnet werden. Das entspricht dem handwerklichen Usus: Material-Aufschlag zuerst, dann der prozentuale Risikoaufschlag.

**Phase 2 — Katalog-Rabatte in Deklarationsreihenfolge:**
Jeder Rabatt wird auf den aktuellen Subtotal angewendet. Bei `percent`-Rabatten mit Cap gilt: der Cap wird vor dem nächsten Rabatt im Stack angewendet. Die Rabattbeträge werden proportional auf betroffene Zeilen verteilt. Restcents gehen an die letzte Zeile, damit kein Cent-Drift entsteht.

**Phase 3 — MwSt.-Gruppierung:**
Verbleibende Netto-Beträge werden nach `vatRate` gruppiert. MwSt. pro Gruppe: `round(netCents × vatRate)`. Gemischte Steuersätze in einer Quote sind valide und werden separat ausgewiesen.

**Rundungsregel:** `Math.round()` nach jedem einzelnen Prozent-Schritt — nie am Ende akkumulieren.

Beispiel: 3 × 250 Cent = 750 Cent Netto → 15% Zuschlag: `round(750 × 1.15)` = 863 Cent → 10% Rabatt: `round(863 × 0.10)` = 86 Cent → 863 − 86 = 777 Cent → 19% MwSt.: `round(777 × 0.19)` = 148 Cent → Brutto: 925 Cent = 9,25 €.

---

## 4. Concurrency beim Publish

**Gewählt: Partieller Unique-Index**

```sql
CREATE UNIQUE INDEX idx_one_published_per_craftsman_trade
ON pricing_service.catalog_versions (craftsman_id, trade)
WHERE status = 'PUBLISHED';
```

Wenn zwei Requests gleichzeitig publishen wollen, gewinnt genau einer. Die Datenbank wirft beim zweiten INSERT einen Unique-Constraint-Fehler egal wie viele Server-Instanzen gerade laufen. Simpel und effektiv.

**Abgelehnt: `SELECT … FOR UPDATE`** — man bräuchte eine extra Lock-Zeile in der Datenbank, mehr Code und mehr Komplexität, ohne dabei etwas besser zu machen als der Unique-Index.

**Abgelehnt: Advisory Lock** — wird von der Applikation verwaltet, nicht von der Datenbank. Bei einem Absturz kann der Lock hängenbleiben. Bei mehreren parallelen Datenbankverbindungen wird es schnell unzuverlässig.

---

## 5. PATCH /trades/:trade — Schema-Validierung bei Konflikt

Wenn das neue `pricingSchema` bestehende `tradeAttributes` invalidieren würde, gibt es einen `409 Conflict` zurück. Die Response enthält `affectedPositions` mit `versionId`, `positionKey`, `positionLabel` und den konkreten `violations` pro Position — damit man genau weiß was kaputt wäre.

**Abgelehnt: `SCHEMA_DRIFTED`-Status** — der Handwerker hätte dann einen inkonsistenten Katalog ohne es zu merken. Der 409 Ansatz zwingt dazu, das Problem vorher zu lösen.

---

## 6. Skalierung zur vollen Pricing Engine

Jede publizierte `CatalogVersion` ist immutable und enthält alle Preisinformationen zum Zeitpunkt des Publish. Der Offer-Generator kann damit gegen eine exakte `versionId` quoten und bekommt reproduzierbare Ergebnisse — auch rückwirkend für Audits.

PDF-Export würde die Quote-Response direkt als Input nehmen, ohne das Datenmodell anzufassen. Neue Trade-Kategorien lassen sich über `pricingSchema` ohne Code-Änderungen hinzufügen.

Future Work: History-Ansicht alter Katalog-Versionen im Partner-Portal und Time-Travel-Quotes (`?at=<ISO>`) gegen vergangene aktive Versionen. Die Grundstruktur ist durch `effectiveFrom` bereits vorhanden.

---

## 7. Frontend

Im partner-portal wurde ein Nav-Link „Mein Preiskatalog" ergänzt, der zu einer leeren `PricingCatalogPage`-Komponente führt. Dazu kommt `pricing-catalog.service.ts` mit allen nötigen API-Integrationen und den passenden Request/Response-Typen.

---

## 8. Was wurde gekürzt

**Frontend (partner-portal):** Die vollständige `Mein Preiskatalog`-Seite wurde nicht implementiert. Nur der Nav-Link, die leere Komponente und `pricing-catalog.service.ts` sind vorhanden.

**Frontend (admin-portal):** Der Schema-Editor für `pricingSchema.fields[]` fehlt komplett — kein Formular, keine Validierung, kein 409-Konflikt-Banner, keine i18n-Keys.

**Time-Travel-Quote (§3.4.3):** Nicht umgesetzt. `effectiveFrom` ist im Datenmodell vorhanden, die Logik zum Auflösen einer Version fehlt.

**Idempotency-Keys (§3.4.1):** Nicht umgesetzt — kein Caching, keine Key-Validierung, keine 409-Logik bei Body-Abweichung.

**Infrastructure as Code / AWS (§3.4.2):** Kein Terraform, keine VPC, kein ECS, kein RDS. War optional — die Zeit wurde lieber in den Backend-Kern investiert.

---

## 9. KI-Nutzung

KI wurde als Werkzeug eingesetzt, nicht als Abkürzung. Konkret für:

**Analyse und Planung** — das Projekt analysieren und die Aufgaben sinnvoll in Teilaufgaben aufteilen. Bei Best-Practice-Fragen als schneller Sparringspartner genutzt.

**Scaffolding** — Entity-Migrationen, Controller- und DTO-Boilerplate, Test-Skelette. Jede generierte Datei wurde Zeile für Zeile gegen `CONVENTIONS.md` geprüft.

**Gegenchecken** — für den Quote-Calculator wurde der Algorithmus mit KI gegengecheckt damit die Berechnungen den Anforderungen entsprechen. Außerdem genutzt um sicherzustellen dass `conventions.md` vollständig eingehalten wurde.

**Eigenständig geschrieben:** Quote-Calculator-Algorithmus, Schema-Validator-Logik, Datenbankdesign.

Generierten Code wurde nie blind übernommen immer erst durchgeschaut, auf Fehler geprüft und erst akzeptiert wenn er verstanden und für gut befunden wurde.
