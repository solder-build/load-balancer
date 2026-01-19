export type EventFilterOptions = {
    programIds: string[];
    programIdls?: Map<string, any>;
};
export type InstructionFilterOptions = {
    programIds: string[];
    programIdls?: Map<string, any>;
};
export type EventInfo = {
    programId: string;
    data: unknown;
};
export type InstructionInfo = {
    programId: string;
    data: unknown;
};
export type BlockTransactionInfo = {
    block_number: number;
    block_hash: string;
    block_ts: number | null;
    txn_hash: string;
    events: EventInfo[];
    instructions: InstructionInfo[];
};
export type BlockInfoResult = {
    block_number: number;
    block_hash: string;
    block_time: number | null;
    transactions: BlockTransactionInfo[];
};
//# sourceMappingURL=block.d.ts.map