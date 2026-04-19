import {
    Entity,
    Column,
    PrimaryColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index
} from 'typeorm'

import type {
    RuleId,
    RuleAction,
    RuleCondition,
} from '../../../../shared/types'

@Entity('rules')
@Index(['isActive', 'priority'])
export class RuleEntity {
    @PrimaryColumn({ type: 'varchar', length: 36 })
    id!: RuleId

    @Column({
        type: 'varchar',
        length: 200,
    })
    name!: string

    @Column({
        type: 'text'
    })
    description!: string

    @Index()
    @Column({
        type: 'boolean',
        name: 'is_active',
        default: true
    })
    isActive!: boolean

    @Column({
        type: 'smallint',
        unsigned: true,
        default: 200
    })
    priority!: number

    @Column({ type: 'json' })
    conditions!: ReadonlyArray<RuleCondition>;

    @Column({
        type: 'enum',
        enum: ['AND', 'OR'],
        name: 'condition_logic',
        default: 'AND'
    })
    conditionLogic!: 'AND' | 'OR'

    @Column({
        type: 'enum',
        enum: [
            'flag',
            'block',
            'revie',
            'approve',
            'notify'
        ]
    })
    action!: RuleAction

    @Column({
        type: 'tinyint',
        name: 'risk_score_impact',
        default: 0
    })
    riskScoreImpact!: number

    @CreateDateColumn({
        name: 'create_at'
    })
    createdAt!: Date

    @UpdateDateColumn({
        name: 'updated_at'
    })
    updateAt!: Date
}