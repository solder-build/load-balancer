import { createSolanaRpc } from "@solana/rpc";
import type { BlockInfoResult, BlockTransactionInfo, EventFilterOptions, InstructionFilterOptions } from "../types/block.js";
export type RpcClientOptions = {
    endpoint?: string;
    cluster?: "devnet" | "testnet" | "mainnet-beta";
    commitment?: "processed" | "confirmed" | "finalized";
    httpHeaders?: Record<string, string>;
};
type BlockInfoOptions = {
    includeEvents?: boolean;
    includeInstructions?: boolean;
    eventFilter?: EventFilterOptions;
    instructionFilter?: InstructionFilterOptions;
} & ({
    includeEvents: true;
    eventFilter: EventFilterOptions;
} | {
    includeInstructions: true;
    instructionFilter: InstructionFilterOptions;
} | {});
export declare class RpcClient {
    private readonly rpc;
    constructor(options?: RpcClientOptions);
    getConnection(): ReturnType<typeof createSolanaRpc>;
    getLatestBlockhash(): Promise<{
        blockhash: string;
        lastValidBlockHeight: bigint;
    }>;
    getSlot(commitment?: "processed" | "confirmed" | "finalized"): Promise<bigint>;
    getBlockTime(slot: number): Promise<number | null>;
    getBlockWithInstructions(slot: number, filter?: {
        programIds: string[];
        programIdls?: Map<string, any>;
    }): Promise<{
        block_number: number;
        block_hash: string;
        block_time: number | null;
        transactions: Array<Omit<BlockTransactionInfo, "events">>;
    } | null>;
    getBlockWithEvents(slot: number, filter: {
        programIds: string[];
        programIdls?: Map<string, any>;
    }): Promise<{
        block_number: number;
        block_hash: string;
        block_time: number | null;
        transactions: Array<Omit<BlockTransactionInfo, "instructions">>;
    } | null>;
    getBlockInfo(slot: number, options?: BlockInfoOptions): Promise<BlockInfoResult | null>;
}
export type { BlockTransactionInfo, BlockInfoResult, EventFilterOptions, InstructionFilterOptions, EventInfo, InstructionInfo, } from "../types/block.js";
//# sourceMappingURL=rpc.d.ts.map