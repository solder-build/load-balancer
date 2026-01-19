import type { BlockInfoResult, EventFilterOptions, InstructionFilterOptions } from "../types/block.js";
type RpcClient = ReturnType<typeof import("@solana/rpc").createSolanaRpc>;
export declare function fetchParsedBlock(rpc: RpcClient, slot: number): Promise<{
    block: unknown;
    blockHash: string | null;
    blockTime: number | null;
}>;
export declare function buildBlockInfoResult(_options: {
    block: unknown;
    slot: number;
    blockHash: string | null;
    blockTime: number | null;
    includeEvents: boolean;
    includeInstructions: boolean;
    eventFilter?: EventFilterOptions;
    instructionFilter?: InstructionFilterOptions;
}): BlockInfoResult;
export {};
//# sourceMappingURL=block.d.ts.map