import { Connection, PublicKey } from '@solana/web3.js';
import { executeTransaction } from './main';

const RAYDIUM_PUBLIC_KEY = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const HTTP_URL = "https://api.mainnet-beta.solana.com/"
const WSS_URL = "wss://api.mainnet-beta.solana.com/"
const RAYDIUM = new PublicKey(RAYDIUM_PUBLIC_KEY);
const INSTRUCTION_NAME = "initialize2";
const SOL_TO_TRADE = 0.0001;

const connection = new Connection(HTTP_URL, {
    wsEndpoint: WSS_URL
});

async function streamNewPools(connection: Connection, programAddress: PublicKey): Promise<void> {
    console.log("Monitoring logs for program:", programAddress.toString());
    connection.onLogs(
        programAddress,
        ({ logs, err, signature }) => {
            if (err) return;

            if (logs && logs.some(log => log.includes(INSTRUCTION_NAME))) {
                console.log("Signature for 'initialize2':", `https://solscan.io/tx/${signature}`);
                const mintData = fetchRaydiumMints(signature, connection);
                mintData.then(async (data) => {
                    if (data !== null) {
                        executeTransaction(SOL_TO_TRADE, data.tokenAccount, data.ammId);
                    }
                });
            }
            "finalized"
        }
    );
    }

async function fetchRaydiumMints(txId: string, connection: Connection): Promise<{ ammId: string, tokenAccount: string } | null> {
    try {
        const tx = await connection.getParsedTransaction(
            txId,
            {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed'
            });

        //@ts-ignore
        const accounts = (tx?.transaction.message.instructions).find(ix => ix.programId.toBase58() === RAYDIUM_PUBLIC_KEY).accounts as PublicKey[];
        if (!accounts) {
            console.log("No accounts found in the transaction.");
            return null;
        }
    
        const tokenAIndex = 8;
        const tokenBIndex = 9;
        const ammdIdIndex = 4;
    
        const tokenAAccount = accounts[tokenAIndex];
        const tokenBAccount = accounts[tokenBIndex];
        const ammId = accounts[ammdIdIndex].toString();
    
        const displayData = [
            { "Token": "A", "Account Public Key": tokenAAccount.toBase58() },
            { "Token": "B", "Account Public Key": tokenBAccount.toBase58() }
        ];

        console.table(displayData);
        if (tokenAAccount.toBase58() !== "So11111111111111111111111111111111111111112") {
            return { ammId, "tokenAccount": tokenAAccount.toBase58() };
        } else if (tokenBAccount.toBase58() !== "So11111111111111111111111111111111111111112") {
            return { ammId, "tokenAccount":tokenBAccount.toBase58() };
        } else {
            return null;
        }
    } catch {
        console.log("Error fetching transaction:", txId);
        return null;
    }
}

streamNewPools(connection, RAYDIUM).catch(console.error);