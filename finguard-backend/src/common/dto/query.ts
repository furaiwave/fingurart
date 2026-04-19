import { 
    IsString, IsEnum, IsOptional, IsInt, Min, Max,
} from 'class-validator'
import { Type } from '@nestjs/common'
import type {
    TransactionType, TransactionChannel, TransactionStatus, RiskLevel
} from '../../../shared/types'

export class TransactionQueryDto{
    @IsOptional()
    @IsEnum([
        'payment',
        'transfer',
        'withdrawal',
        'deposit',
        'refund',
        'chargeback'
    ] satisfies TransactionType[])
    type?: TransactionType

    @IsOptional()
    @IsEnum([
        'card_present',
        'card_not_present',
        'bank_transfer',
        'crypto',
        'mobile_payment',
        'atm'
    ] satisfies TransactionChannel[])
    channel?: TransactionChannel

    @IsOptional()
    @IsEnum([
        'pending',
        'analyzing',
        'approved',
        'approved_with_review',
        'blocked',
        'manual_review'
    ] satisfies TransactionStatus[])
    status?: TransactionStatus

    @IsOptional()
    @IsEnum([
        'low',
        'medium',
        'high',
        'critical',
    ] satisfies RiskLevel[])
    riskLevel?: RiskLevel

    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number = 1

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number = 20

    @IsOptional()
    @IsString()
    sortBy?: string = 'createdAt'

    @IsOptional()
    @IsEnum(['ASC', 'DESC'])
    sortOrder?: 'ASC' | 'DESC' = 'DESC'
}