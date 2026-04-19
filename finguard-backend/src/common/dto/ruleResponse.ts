import { RuleAction, RuleCondition } from "shared/types"

export class RuleResponseDto {
    readonly id!: string
    readonly name!: string
    readonly description!: string
    readonly isActive!: boolean
    readonly conditions!: ReadonlyArray<RuleCondition>
    readonly conditionLogic!: 'AND' | 'OR'
    readonly action!: RuleAction
    readonly createdAt!: string
    readonly updatedAt!: string
}