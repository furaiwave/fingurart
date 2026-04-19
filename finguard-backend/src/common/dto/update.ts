import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, MinLength, Min, Max, IsArray, ValidateNested, IsEnum } from "class-validator";
import { RuleConditionDto } from "./rule";
import  type { RuleAction } from "shared/types";

export class UpdateRulesDto {
    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(200)
    name?: string

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    description?: string

    @IsOptional()
    @IsBoolean()
    isActive?: boolean

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(1000)
    priority?: number

    @IsOptional()
    @IsArray()
    @ValidateNested({
        each: true
    })
    @Type(() => RuleConditionDto)
    conditions?: RuleConditionDto[]

    @IsOptional()
    @IsEnum(['AND', 'OR'])
    conditionLogic?: 'AND' | 'OR'

    @IsOptional()
    @IsEnum([
        'flag',
        'block',
        'review',
        'approve',
        'notify'
    ] satisfies RuleAction[])
    action?: RuleAction
}