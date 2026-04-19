import {
    Entity,
    Column,
    PrimaryColumn,
} from 'typeorm'

import type {
    RepotyId,
    ReportDate,
    ReportPeriod,
    ReportType
} from '../../../../shared/types'

@Entity('reports')
export class RepoerEntity {
    @PrimaryColumn({ type: 'varchar', length: 36 })
    id!: RepotyId

    @Column({ type: 'varchar', length: 200 })
    name!: string

    @Column({
        type: 'enum',
        enum: [
            'fraud_summary',
            'transaction_volume',
            'risk_distribution',
            'rule_effctiveness',
            'ai_performance'
        ]
    })
    type!: ReportType

    @Column({
        type: 'enum',
        enum: [
            'daily',
            'weekly',
            'monthly',
            'custom'
        ]
    })
    period!: ReportPeriod

    @Column({
        type: 'json',
    })
    data!: ReportDate

    @Column({ 
        name: 'generated_at'
    })
    generatedAt!: Date
}