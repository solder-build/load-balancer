import { createSolanaRpc } from "@solana/rpc";
import { fetchParsedBlock, buildBlockInfoResult } from "../utils/block.js";
export class RpcClient {
    rpc;
    constructor(options = {}) {
        const { endpoint, cluster = "devnet", commitment = "confirmed", httpHeaders, } = options;
        let url;
        if (endpoint) {
            url = endpoint;
        }
        else {
            // Map cluster to URL
            switch (cluster) {
                case "devnet":
                    url = "https://api.devnet.solana.com";
                    break;
                case "testnet":
                    url = "https://api.testnet.solana.com";
                    break;
                case "mainnet-beta":
                    url = "https://api.mainnet-beta.solana.com";
                    break;
                default:
                    url = "https://api.devnet.solana.com";
            }
        }
        this.rpc = createSolanaRpc(url);
    }
    getConnection() {
        return this.rpc;
    }
    async getLatestBlockhash() {
        const response = await this.rpc.getLatestBlockhash().send();
        return response.value;
    }
    async getSlot(commitment = "confirmed") {
        const response = await this.rpc.getSlot({ commitment }).send();
        return response;
    }
    async getBlockTime(slot) {
        const response = await this.rpc.getBlockTime(BigInt(slot)).send();
        return response ? Number(response) : null;
    }
    // --- Shared helpers are in utils/block.ts ---
    async getBlockWithInstructions(slot, filter) {
        const data = await this.getBlockInfo(slot, {
            includeEvents: false,
            includeInstructions: true,
            instructionFilter: (filter ?? { programIds: [] }),
        });
        if (!data)
            return null;
        return {
            block_number: data.block_number,
            block_hash: data.block_hash,
            block_time: data.block_time,
            transactions: data.transactions
                .filter((txn) => txn.instructions.length > 0)
                .map((txn) => ({
                block_number: txn.block_number,
                block_hash: txn.block_hash,
                block_ts: txn.block_ts,
                txn_hash: txn.txn_hash,
                instructions: txn.instructions,
            })),
        };
    }
    async getBlockWithEvents(slot, filter) {
        const data = await this.getBlockInfo(slot, {
            includeEvents: true,
            includeInstructions: false,
            eventFilter: filter,
        });
        if (!data)
            return null;
        return {
            block_number: data.block_number,
            block_hash: data.block_hash,
            block_time: data.block_time,
            transactions: data.transactions
                .filter((txn) => txn.events.length > 0)
                .map((txn) => ({
                block_number: txn.block_number,
                block_hash: txn.block_hash,
                block_ts: txn.block_ts,
                txn_hash: txn.txn_hash,
                events: txn.events,
            })),
        };
    }
    async getBlockInfo(slot, options = {}) {
        const includeEvents = options.includeEvents ?? true;
        const includeInstructions = options.includeInstructions ?? true;
        if (!includeEvents && !includeInstructions) {
            return {
                block_number: slot,
                block_hash: "",
                block_time: null,
                transactions: [],
            };
        }
        const { block, blockHash, blockTime } = await fetchParsedBlock(this.rpc, slot);
        if (!block || !blockHash)
            return null;
        return buildBlockInfoResult({
            block,
            slot,
            blockHash,
            blockTime,
            includeEvents,
            includeInstructions,
            eventFilter: options.eventFilter,
            instructionFilter: options.instructionFilter,
        });
    }
}
//# sourceMappingURL=rpc.js.map