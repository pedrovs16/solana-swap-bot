import { Connection, PublicKey } from '@solana/web3.js';
import { executeTransaction } from './main.js';
import logger from './logger.js';

const RAYDIUM_PUBLIC_KEY = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const HTTP_URL = 'https://api.mainnet-beta.solana.com/';
const WSS_URL = 'wss://api.mainnet-beta.solana.com/';
const RAYDIUM = new PublicKey(RAYDIUM_PUBLIC_KEY);
const INSTRUCTION_NAME = 'initialize2';
const SOL_TO_TRADE = 0.00001;
const connection = new Connection(HTTP_URL, {
    wsEndpoint: WSS_URL,
});

const processedSignatures = new Set<string>();

async function streamNewPools(connection: Connection, programAddress: PublicKey): Promise<void> {
    const streamProgramPublicKey = programAddress.toString();
    logger.info('Monitoring logs for program:', { streamProgramPublicKey });

    connection.onLogs(programAddress, async ({ logs, err, signature }) => {
        if (err) return;
        if (processedSignatures.has(signature)) {
            logger.debug(`Signature already processed. Skipping...`, { signature });
            return;
        }
        if (logs && logs.some((log) => log.includes(INSTRUCTION_NAME))) {
            processedSignatures.add(signature);
            logger.info("Signature for 'initialize2':", `https://solscan.io/tx/${signature}`);
            const mintData = await fetchRaydiumMints(signature, connection);
            if (mintData !== null) {
                await executeTransaction(SOL_TO_TRADE, mintData.tokenAccount, mintData.ammId);
            }
        }
    });
}

async function fetchRaydiumMints(
    txId: string,
    connection: Connection
): Promise<{ ammId: string; tokenAccount: string } | null> {
    try {
        const tx = await connection.getParsedTransaction(txId, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed',
        });

        const accounts = (tx?.transaction.message.instructions as any[]).find(
            (ix) => ix.programId.toBase58() === RAYDIUM_PUBLIC_KEY
        )?.accounts as PublicKey[];

        if (!accounts) {
            logger.info('No accounts found in the transaction.');
            return null;
        }

        const tokenAIndex = 8;
        const tokenBIndex = 9;
        const ammdIdIndex = 4;

        const tokenAAccount = accounts[tokenAIndex];
        const tokenBAccount = accounts[tokenBIndex];
        const ammId = accounts[ammdIdIndex].toString();

        const displayData = [
            { Token: 'A', 'Account Public Key': tokenAAccount.toBase58() },
            { Token: 'B', 'Account Public Key': tokenBAccount.toBase58() },
        ];

        console.log('Display Data:', displayData);
        let tokenAccount;
        if (tokenAAccount.toBase58() !== 'So11111111111111111111111111111111111111112') {
            tokenAccount = tokenAAccount.toBase58();
        } else if (tokenBAccount.toBase58() !== 'So11111111111111111111111111111111111111112') {
            tokenAccount = tokenBAccount.toBase58();
        } else {
            return null;
        }
        logger.info('AMM ID:', { ammId });
        logger.info('Token Account:', { tokenAccount });
        return { ammId, tokenAccount };
    } catch (error) {
        logger.error('Error fetching transaction:', { txId, error });
        return null;
    }
}

streamNewPools(connection, RAYDIUM).catch(console.error);
