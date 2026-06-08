import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '@sandbox/auth';
import { JwtPayload, UserRole } from '@sandbox/types';

import { PricingCatalogService } from './pricing-catalog.service';
import { CreateCatalogVersionDto } from './dto/create-catalog-version.dto';
import { UpdateCatalogVersionDto } from './dto/update-catalog-version.dto';
import { QueryCatalogVersionsDto } from './dto/query-catalog-versions.dto';
import { CatalogVersionResponseDto } from './dto/catalog-version-response.dto';
import { QuoteRequestDto } from './dto/quote-request.dto';
import { QuoteResponseDto } from './dto/quote-response.dto';

@ApiTags('Pricing Catalogs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pricing-catalogs')
export class PricingCatalogController {
  constructor(private readonly service: PricingCatalogService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CRAFTSMAN)
  @ApiOperation({ summary: 'List catalog versions, newest first' })
  @ApiResponse({ status: 200, type: [CatalogVersionResponseDto] })
  list(
    @Query() query: QueryCatalogVersionsDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CatalogVersionResponseDto[]> {
    return this.service.list(query, user);
  }

  @Get(':versionId')
  @Roles(UserRole.ADMIN, UserRole.CRAFTSMAN)
  @ApiOperation({ summary: 'Get one catalog version including positions and discounts' })
  @ApiResponse({ status: 200, type: CatalogVersionResponseDto })
  @ApiResponse({ status: 403, description: 'Caller may not access this catalog' })
  @ApiResponse({ status: 404, description: 'Catalog version not found' })
  findOne(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CatalogVersionResponseDto> {
    return this.service.findOne(versionId, user);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.CRAFTSMAN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new DRAFT catalog version for (craftsmanId, trade)' })
  @ApiResponse({ status: 201, type: CatalogVersionResponseDto })
  @ApiResponse({ status: 403, description: 'Caller may not create a catalog for this craftsman' })
  create(
    @Body() dto: CreateCatalogVersionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CatalogVersionResponseDto> {
    return this.service.create(dto, user);
  }

  @Post(':versionId/publish')
  @Roles(UserRole.ADMIN, UserRole.CRAFTSMAN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish a DRAFT catalog version' })
  @ApiResponse({ status: 200, type: CatalogVersionResponseDto })
  @ApiResponse({ status: 400, description: 'Version is not a DRAFT' })
  @ApiResponse({ status: 403, description: 'Caller may not publish this catalog' })
  @ApiResponse({ status: 404, description: 'Catalog version not found' })
  @ApiResponse({ status: 409, description: 'A published version already exists for this (craftsmanId, trade)' })
  publish(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CatalogVersionResponseDto> {
    return this.service.publish(versionId, user);
  }

  @Post(':versionId/quote')
  @Roles(UserRole.ADMIN, UserRole.CRAFTSMAN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Calculate a quote against this exact catalog version' })
  @ApiResponse({ status: 200, type: QuoteResponseDto })
  @ApiResponse({ status: 400, description: 'Unknown position key, quantity out of range, or undeclared surcharge key' })
  @ApiResponse({ status: 403, description: 'Caller may not access this catalog' })
  @ApiResponse({ status: 404, description: 'Catalog version not found' })
  quote(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: QuoteRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<QuoteResponseDto> {
    return this.service.quote(versionId, dto, user);
  }

  @Patch(':versionId')
  @Roles(UserRole.ADMIN, UserRole.CRAFTSMAN)
  @ApiOperation({ summary: 'Update a DRAFT catalog version (positions, discounts, effectiveFrom)' })
  @ApiResponse({ status: 200, type: CatalogVersionResponseDto })
  @ApiResponse({ status: 400, description: 'Version is not a DRAFT and cannot be edited' })
  @ApiResponse({ status: 403, description: 'Caller may not edit this catalog' })
  @ApiResponse({ status: 404, description: 'Catalog version not found' })
  update(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: UpdateCatalogVersionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CatalogVersionResponseDto> {
    return this.service.update(versionId, dto, user);
  }
}
