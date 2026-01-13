import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './App.css';

// Contract ABI - Pastikan event Transfer ada dengan format yang benar
const contractABI = [
  // Fungsi-fungsi view
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
  "function taxFee() view returns (uint256)",
  "function isBlacklisted(address) view returns (bool)",
  
  // Fungsi-fungsi write
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function setTaxFee(uint256 newTaxFee)",
  "function mint(address to, uint256 amount)",
  "function burn(uint256 amount)",
  "function pause()",
  "function unpause()",
  "function blacklist(address account)",
  "function unblacklist(address account)",
  "function transferOwnership(address newOwner)",
  
  // Events - PENTING untuk MetaMask tracking
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)"
];

// RPC Configuration
const RPC_URL = "https://ethereum-sepolia.publicnode.com";
// GANTI dengan alamat kontrak BARU setelah deploy ulang
const CONTRACT_ADDRESS = "0xA82914604e7Df80EEEBbCA9bCE5c3Bc9fAF9B505";

const App = () => {
  const [account, setAccount] = useState('');
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [balance, setBalance] = useState('0');
  const [isOwner, setIsOwner] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [tokenInfo, setTokenInfo] = useState({
    name: '',
    symbol: '',
    totalSupply: '',
    taxFee: ''
  });
  const [holders, setHolders] = useState([]);
  const [loadingHolders, setLoadingHolders] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Initialize provider
  useEffect(() => {
    const initProvider = async () => {
      try {
        let web3Provider;
        
        if (window.ethereum) {
          web3Provider = new ethers.BrowserProvider(window.ethereum);
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: '0xaa36a7' }],
            });
          } catch (switchError) {
            if (switchError.code === 4902) {
              try {
                await window.ethereum.request({
                  method: 'wallet_addEthereumChain',
                  params: [{
                    chainId: '0xaa36a7',
                    chainName: 'Sepolia',
                    rpcUrls: [RPC_URL],
                    nativeCurrency: {
                      name: 'Sepolia ETH',
                      symbol: 'ETH',
                      decimals: 18
                    },
                    blockExplorerUrls: ['https://sepolia.etherscan.io']
                  }]
                });
              } catch (addError) {
                console.error("Failed to add Sepolia network:", addError);
              }
            }
          }
        } else {
          web3Provider = new ethers.JsonRpcProvider(RPC_URL);
        }
        
        setProvider(web3Provider);
        const tokenContract = new ethers.Contract(
          CONTRACT_ADDRESS,
          contractABI,
          web3Provider
        );
        setContract(tokenContract);
        loadTokenInfo(tokenContract);
      } catch (error) {
        console.error("Error initializing provider:", error);
      }
    };
    
    initProvider();
  }, []);

  const loadTokenInfo = async (contractInstance) => {
    try {
      const name = await contractInstance.name();
      const symbol = await contractInstance.symbol();
      const totalSupply = await contractInstance.totalSupply();
      const decimals = await contractInstance.decimals();
      const taxFee = await contractInstance.taxFee();
      
      setTokenInfo({
        name,
        symbol,
        totalSupply: ethers.formatUnits(totalSupply, decimals),
        taxFee: ethers.formatUnits(taxFee, 2) + '%'
      });
    } catch (error) {
      console.error("Error loading token info:", error);
    }
  };

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert('Please install MetaMask!');
        return;
      }
      
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });
      
      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      const signerInstance = await web3Provider.getSigner();
      const userAccount = accounts[0];
      
      setAccount(userAccount);
      setSigner(signerInstance);
      
      const contractWithSigner = contract.connect(signerInstance);
      setContract(contractWithSigner);
      
      const ownerAddress = await contractWithSigner.owner();
      setIsOwner(ownerAddress.toLowerCase() === userAccount.toLowerCase());
      
      await loadBalance(userAccount, contractWithSigner);
      
    } catch (error) {
      console.error("Error connecting wallet:", error);
    }
  };

  const loadBalance = async (address, contractInstance) => {
    try {
      const balance = await contractInstance.balanceOf(address);
      const decimals = await contractInstance.decimals();
      setBalance(ethers.formatUnits(balance, decimals));
    } catch (error) {
      console.error("Error loading balance:", error);
    }
  };

  // ===== FUNGSI TRANSFER YANG DIPERBAIKI UNTUK META-MASK AUTO-UPDATE =====
  const handleTransfer = async (toOwner = false) => {
    try {
      if (!contract || !signer) {
        alert('Please connect wallet first');
        return;
      }
      
      const decimals = await contract.decimals();
      const amount = ethers.parseUnits(transferAmount, decimals);
      let recipientAddress = recipient;
      
      if (toOwner) {
        recipientAddress = await contract.owner();
      }
      
      if (!recipientAddress) {
        alert('Please enter recipient address');
        return;
      }
      
      setIsRefreshing(true);
      const tx = await contract.transfer(recipientAddress, amount);
      const receipt = await tx.wait();
      
      alert('Transfer successful! Transaction hash: ' + receipt.hash);
      
      // PERBAIKAN 1: Refresh balance di frontend kita
      await loadBalance(account, contract);
      
      // PERBAIKAN 2: Paksa MetaMask untuk refresh saldo token
      if (window.ethereum && window.ethereum.request) {
        try {
          // Method 1: Request MetaMask untuk watch asset (sering trigger refresh)
          await window.ethereum.request({
            method: 'wallet_watchAsset',
            params: {
              type: 'ERC20',
              options: {
                address: CONTRACT_ADDRESS,
                symbol: 'TR',
                decimals: 4,
                image: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png' // Optional logo
              }
            }
          });
          
          // Method 2: Request account refresh (alternatif)
          setTimeout(async () => {
            try {
              await window.ethereum.request({
                method: 'wallet_requestPermissions',
                params: [{ eth_accounts: {} }]
              });
            } catch (permError) {
              console.log("Permission refresh optional:", permError);
            }
          }, 1000);
          
        } catch (watchError) {
          console.log("MetaMask watchAsset skipped:", watchError);
        }
      }
      
      // PERBAIKAN 3: Tambahkan delay dan refresh ulang
      setTimeout(async () => {
        await loadBalance(account, contract);
        setIsRefreshing(false);
      }, 2000);
      
      // Clear form
      setTransferAmount('');
      if (!toOwner) setRecipient('');
      
    } catch (error) {
      console.error("Transfer error:", error);
      alert('Transfer failed: ' + error.message);
      setIsRefreshing(false);
    }
  };

  // Fungsi untuk manual refresh MetaMask saldo
  const refreshMetaMaskBalance = async () => {
    if (!window.ethereum || !account) return;
    
    try {
      // Method 1: Panggil wallet_watchAsset untuk refresh
      await window.ethereum.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: CONTRACT_ADDRESS,
            symbol: 'TR',
            decimals: 4
          }
        }
      });
      
      // Method 2: Refresh balance kita juga
      await loadBalance(account, contract);
      
      alert('MetaMask balance refresh requested!');
    } catch (error) {
      console.log("Refresh error:", error);
    }
  };

  const loadTokenHolders = async () => {
    try {
      if (!contract || !isOwner) {
        alert('Only owner can view token holders');
        return;
      }

      setLoadingHolders(true);
      setHolders([]);

      const filter = contract.filters.Transfer();
      const events = await contract.queryFilter(filter, 0, 'latest');

      const balancesMap = new Map();
      const decimals = 4;

      events.forEach(event => {
        const { from, to, value } = event.args;
        const valueNum = Number(ethers.formatUnits(value, decimals));

        if (from !== ethers.ZeroAddress) {
          const fromBalance = balancesMap.get(from) || 0;
          balancesMap.set(from, fromBalance - valueNum);
        }

        const toBalance = balancesMap.get(to) || 0;
        balancesMap.set(to, toBalance + valueNum);
      });

      const holdersList = [];
      balancesMap.forEach((balance, address) => {
        if (balance > 0) {
          holdersList.push({
            address: address,
            balance: balance.toFixed(4)
          });
        }
      });

      holdersList.sort((a, b) => b.balance - a.balance);
      setHolders(holdersList);
      console.log('Holders loaded:', holdersList);

    } catch (error) {
      console.error("Error loading holders from events:", error);
      alert('Gagal memuat daftar pemegang: ' + error.message);
    } finally {
      setLoadingHolders(false);
    }
  };

  const handleMint = async () => {
    try {
      if (!isOwner) {
        alert('Only owner can mint tokens');
        return;
      }
      
      const amount = prompt('Enter amount to mint:');
      if (!amount) return;
      
      const decimals = await contract.decimals();
      const mintAmount = ethers.parseUnits(amount, decimals);
      
      const tx = await contract.mint(account, mintAmount);
      await tx.wait();
      
      alert('Mint successful!');
      await loadBalance(account, contract);
      
    } catch (error) {
      console.error("Mint error:", error);
      alert('Mint failed: ' + error.message);
    }
  };

  const handleBurn = async () => {
    try {
      if (!isOwner) {
        alert('Only owner can burn tokens');
        return;
      }
      
      const amount = prompt('Enter amount to burn:');
      if (!amount) return;
      
      const decimals = await contract.decimals();
      const burnAmount = ethers.parseUnits(amount, decimals);
      
      const tx = await contract.burn(burnAmount);
      await tx.wait();
      
      alert('Burn successful!');
      await loadBalance(account, contract);
      
    } catch (error) {
      console.error("Burn error:", error);
      alert('Burn failed: ' + error.message);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Robusta Token Dashboard</h1>
        
        <div className="wallet-section">
          {!account ? (
            <button onClick={connectWallet} className="connect-btn">
              Connect Wallet
            </button>
          ) : (
            <div className="account-info">
              <div className="status-badge">
                {isOwner ? '👑 Owner' : '👤 Akun Tamu'}
              </div>
              <p className="account-address">
                Account: {account.substring(0, 6)}...{account.substring(account.length - 4)}
              </p>
              <p className="token-balance">
                Your Balance: {balance} TR 
                {isRefreshing && <span className="refreshing-indicator"> (Refreshing...)</span>}
              </p>
              <button 
                onClick={refreshMetaMaskBalance} 
                className="refresh-btn"
                title="Force refresh MetaMask balance"
              >
                🔄 Refresh MetaMask
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="App-main">
        <section className="token-info">
          <h2>Token Information</h2>
          <div className="info-grid">
            <div className="info-card">
              <h3>Token Name</h3>
              <p>{tokenInfo.name}</p>
            </div>
            <div className="info-card">
              <h3>Symbol</h3>
              <p>{tokenInfo.symbol}</p>
            </div>
            <div className="info-card">
              <h3>Total Supply</h3>
              <p>{tokenInfo.totalSupply} TR</p>
            </div>
            <div className="info-card">
              <h3>Tax Fee</h3>
              <p>{tokenInfo.taxFee} per transaction</p>
            </div>
          </div>
        </section>

        <section className="transfer-section">
          <h2>Transfer Tokens</h2>
          <div className="transfer-form">
            <input
              type="text"
              placeholder="Recipient Address (0x...)"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="address-input"
            />
            <input
              type="number"
              placeholder="Amount"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              className="amount-input"
              step="0.0001"
              min="0"
            />
            <div className="button-group">
              <button 
                onClick={() => handleTransfer(false)}
                className="transfer-btn"
                disabled={!account || isRefreshing}
              >
                {isRefreshing ? 'Processing...' : 'Transfer to Address'}
              </button>
              <button 
                onClick={() => handleTransfer(true)}
                className="transfer-owner-btn"
                disabled={!account || isRefreshing}
              >
                {isRefreshing ? 'Processing...' : 'Transfer to Owner (with tax)'}
              </button>
            </div>
            <p className="tax-notice">
              Note: All transfers include {tokenInfo.taxFee} tax fee to owner
            </p>
            <p className="refresh-notice">
              ⚡ After transfer, MetaMask should auto-update. If not, click "Refresh MetaMask" button above.
            </p>
          </div>
        </section>

        {isOwner && (
          <section className="owner-section">
            <h2>Owner Functions</h2>
            <div className="owner-controls">
              <button onClick={handleMint} className="owner-btn mint-btn">
                Mint Tokens
              </button>
              <button onClick={handleBurn} className="owner-btn burn-btn">
                Burn Tokens
              </button>
              <button 
                onClick={loadTokenHolders} 
                className="owner-btn holders-btn"
                disabled={loadingHolders}
              >
                {loadingHolders ? 'Loading...' : 'View Token Holders'}
              </button>
            </div>

            {loadingHolders ? (
              <div className="loading-message">
                <p>Memuat daftar pemegang token...</p>
              </div>
            ) : holders.length > 0 ? (
              <div className="holders-list">
                <h3>Token Holders ({holders.length})</h3>
                <div className="table-container">
                  <table className="holders-table">
                    <thead>
                      <tr>
                        <th>No</th>
                        <th>Address</th>
                        <th>Balance (TR)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holders.map((holder, index) => (
                        <tr key={index}>
                          <td>{index + 1}</td>
                          <td title={holder.address}>
                            {holder.address.substring(0, 10)}...{holder.address.substring(holder.address.length - 8)}
                          </td>
                          <td>{holder.balance}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="no-holders-message">
                <p>Belum ada data pemegang token. Coba klik "View Token Holders" setelah melakukan beberapa transfer.</p>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="App-footer">
        <p>Robusta Token (TR) • Sepolia Testnet</p>
        <p>Max Supply: 7,000,000 TR • Decimals: 4</p>
        <p className="footer-note">
          Note: For immediate MetaMask balance updates, use the "Refresh MetaMask" button above.
        </p>
      </footer>
    </div>
  );
};

export default App;