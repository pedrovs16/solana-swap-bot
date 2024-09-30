import {
    Connection,
    PublicKey,
    Transaction,
    sendAndConfirmTransaction,
    Keypair,
} from '@solana/web3.js';
import { getAssociatedTokenAddress, createCloseAccountInstruction } from '@solana/spl-token';
import bs58 from 'bs58';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import dotenv from 'dotenv';

dotenv.config();

// Initialize connection to the desired network (mainnet-beta, testnet, or devnet)
const connection = new Connection('https://api.mainnet-beta.solana.com');

// Replace with your wallet's secret key array or Base58-encoded secret key
const secretKey = bs58.decode(process.env.SOLANA_WALLET); // Replace with your secret key
const payer = Keypair.fromSecretKey(secretKey);

const fetchTokenAccounts = async () => {
    try {
        // Fetch all token accounts owned by the payer's public key
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(payer.publicKey, {
            programId: TOKEN_PROGRAM_ID,
        });

        if (tokenAccounts.value.length === 0) {
            console.log('No token accounts found for this wallet.');
            return [];
        }

        const mintAddresses = [];

        for (const tokenAccountInfo of tokenAccounts.value) {
            const tokenAccountData = tokenAccountInfo.account.data.parsed.info;

            const mintAddress = tokenAccountData.mint;
            const tokenAmount = tokenAccountData.tokenAmount.uiAmountString;
            if (!mintAddress.startsWith('So11'))
                if (tokenAmount === '0') {
                    mintAddresses.push(mintAddress);
                }
        }

        return mintAddresses;
    } catch (error) {
        console.error('Error fetching token accounts:', error);
        return [];
    }
};

const mintAddresses = await fetchTokenAccounts();
console.log('Mint Addresses:', mintAddresses);

// Replace with the token mint address of the ATA you want to close
for (const mintAddress of mintAddresses) {
    try {
        console.log('Closing ATA for mint:', mintAddress);
        const mint = new PublicKey(mintAddress);

        // Get the associated token address (ATA) for the specified mint and owner
        const associatedTokenAddress = await getAssociatedTokenAddress(
            mint,
            payer.publicKey,
            false // Set to true if the owner's public key is off-curve (usually false)
        );

        console.log('Associated Token Address:', associatedTokenAddress.toBase58());

        // Create the CloseAccount instruction to close the ATA
        const closeAccountIx = createCloseAccountInstruction(
            associatedTokenAddress, // The ATA to close
            payer.publicKey, // Destination account to receive the refunded SOL
            payer.publicKey // Authority (owner) of the ATA
        );

        // Create a transaction and add the CloseAccount instruction
        const transaction = new Transaction().add(closeAccountIx);

        // Send and confirm the transaction
        const signature = await sendAndConfirmTransaction(connection, transaction, [payer], {
            skipPreflight: false,
            commitment: 'confirmed',
        });

        console.log('Transaction successful with signature:', signature);
        await new Promise((resolve) => setTimeout(resolve, 10000));
    } catch (error) {
        console.error('Error closing the Associated Token Account:', error);
    }
}
