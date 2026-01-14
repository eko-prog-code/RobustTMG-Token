import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import './App.css';
import { CopyToClipboard } from 'react-copy-to-clipboard';

// Icons (gunakan react-icons)
import { FiCopy, FiSearch, FiRefreshCw } from 'react-icons/fi';

// Contract ABI - TAMBAHKAN FUNGSI GETALLTOKENHOLDERS
const contractABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
  "function taxFee() view returns (uint256)",
  "function setTaxFee(uint256 newTaxFee)",
  "function mint(address to, uint256 amount)",
  "function burn(uint256 amount)",
  "function pause()",
  "function unpause()",
  "function blacklist(address account)",
  "function unblacklist(address account)",
  "function isBlacklisted(address account) view returns (bool)",
  "function getAllTokenHolders() view returns (address[], uint256[])", // TAMBAHKAN INI
  "function getHoldersCount() view returns (uint256)", // TAMBAHKAN INI
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

// RPC Configuration
const RPC_URL = "https://ethereum-sepolia.publicnode.com";
// GANTI DENGAN ALAMAT KONTRAK ANDA SETELAH DEPLOY
const CONTRACT_ADDRESS = "0x9ef9a22599Cb4A8C75D20755256cC5F9a1E389D2";

// Fungsi untuk memformat angka dengan pemisah ribuan
const formatNumber = (num) => {
  if (!num) return '0';
  
  // Jika input adalah string, konversi ke number
  const number = typeof num === 'string' ? parseFloat(num) : num;
  
  // Pisah bagian integer dan desimal
  const parts = number.toString().split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1] || '';
  
  // Format integer part dengan pemisah ribuan
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  // Gabungkan dengan desimal jika ada
  return decimalPart ? `${formattedInteger},${decimalPart}` : formattedInteger;
};

// Fungsi untuk memformat saldo dengan presisi tinggi
const formatBalance = (balance, decimals = 4) => {
  try {
    if (!balance || balance === '0') return '0';
    
    const balanceNumber = parseFloat(balance);
    
    // Jika saldo sangat kecil (< 0.0001), tampilkan dengan notasi ilmiah
    if (balanceNumber < 0.0001 && balanceNumber > 0) {
      return balanceNumber.toExponential(6);
    }
    
    // Untuk saldo normal, format dengan desimal
    const options = {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
      useGrouping: true
    };
    
    return balanceNumber.toLocaleString('id-ID', options);
  } catch (error) {
    return balance;
  }
};

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
  const [filteredHolders, setFilteredHolders] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedAddress, setCopiedAddress] = useState(null);
  const [showAllHolders, setShowAllHolders] = useState(false);
  const [holdersCount, setHoldersCount] = useState(0);
  
  const eventListenerRef = useRef(null);

  // Initialize provider dan load holders saat pertama kali
  useEffect(() => {
    const initProvider = async () => {
      try {
        let web3Provider;
        
        if (window.ethereum) {
          web3Provider = new ethers.BrowserProvider(window.ethereum);
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
        
        // Load holders saat pertama kali (walau belum connect wallet)
        await loadAllTokenHolders(tokenContract);
        
      } catch (error) {
        console.error("Error initializing provider:", error);
      }
    };
    
    initProvider();
    
    // Cleanup event listener
    return () => {
      if (eventListenerRef.current && window.ethereum) {
        window.ethereum.removeListener('accountsChanged', eventListenerRef.current);
        window.ethereum.removeListener('chainChanged', eventListenerRef.current);
      }
    };
  }, []);

  // Setup event listener untuk perubahan akun dan saldo
  useEffect(() => {
    if (window.ethereum && contract && account) {
      const handleAccountsChanged = async (accounts) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          await loadBalance(accounts[0], contract);
          
          // Check if still owner
          const ownerAddress = await contract.owner();
          setIsOwner(ownerAddress.toLowerCase() === accounts[0].toLowerCase());
        } else {
          setAccount('');
          setBalance('0');
          setIsOwner(false);
        }
      };

      const handleChainChanged = () => {
        window.location.reload();
      };

      // Listen untuk Transfer event untuk update real-time
      const transferFilter = contract.filters.Transfer();
      contract.on(transferFilter, async (from, to, value) => {
        console.log('Transfer event detected:', { from, to, value });
        
        // Refresh balance jika user terlibat
        if (account && (from.toLowerCase() === account.toLowerCase() || 
            to.toLowerCase() === account.toLowerCase())) {
          await loadBalance(account, contract);
        }
        
        // Refresh holders list
        await loadAllTokenHolders(contract);
      });

      // Setup event listeners
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);
      
      eventListenerRef.current = handleAccountsChanged;
    }
  }, [contract, account]);

  // Filter holders berdasarkan search term
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredHolders(holders);
    } else {
      const filtered = holders.filter(holder =>
        holder.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
        holder.formattedAddress.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredHolders(filtered);
    }
  }, [searchTerm, holders]);

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

  // Fungsi untuk load semua token holders (bisa diakses publik)
  const loadAllTokenHolders = async (contractInstance) => {
    try {
      setLoadingHolders(true);
      
      // Gunakan fungsi getAllTokenHolders dari smart contract
      const [addresses, balances] = await contractInstance.getAllTokenHolders();
      const decimals = await contractInstance.decimals();
      
      const holdersList = [];
      
      for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i];
        const balanceWei = balances[i];
        const balanceFormatted = ethers.formatUnits(balanceWei, decimals);
        
        holdersList.push({
          address: address,
          formattedAddress: `${address.substring(0, 6)}...${address.substring(address.length - 4)}`,
          balance: balanceFormatted,
          balanceFormatted: formatBalance(balanceFormatted, 4)
        });
      }
      
      // Urutkan dari saldo terbesar ke terkecil
      holdersList.sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance));
      
      setHolders(holdersList);
      setFilteredHolders(holdersList);
      
      // Get holders count
      const count = await contractInstance.getHoldersCount();
      setHoldersCount(Number(count));
      
    } catch (error) {
      console.error("Error loading token holders:", error);
      // Fallback: coba load dari events jika fungsi tidak tersedia
      await loadHoldersFromEvents(contractInstance);
    } finally {
      setLoadingHolders(false);
    }
  };

  // Fallback function jika getAllTokenHolders tidak tersedia
  const loadHoldersFromEvents = async (contractInstance) => {
    try {
      const filter = contractInstance.filters.Transfer();
      const events = await contractInstance.queryFilter(filter, 0, 'latest');
      
      const balancesMap = new Map();
      const decimals = await contractInstance.decimals();
      
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
            formattedAddress: `${address.substring(0, 6)}...${address.substring(address.length - 4)}`,
            balance: balance.toFixed(4),
            balanceFormatted: formatBalance(balance.toFixed(4), 4)
          });
        }
      });
      
      holdersList.sort((a, b) => b.balance - a.balance);
      setHolders(holdersList);
      setFilteredHolders(holdersList);
      setHoldersCount(holdersList.length);
      
    } catch (error) {
      console.error("Error loading holders from events:", error);
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
      const formattedBalance = ethers.formatUnits(balance, decimals);
      setBalance(formattedBalance);
    } catch (error) {
      console.error("Error loading balance:", error);
    }
  };

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
      
      const tx = await contract.transfer(recipientAddress, amount);
      await tx.wait();
      
      alert('Transfer successful!');
      
      // Refresh data setelah transfer
      await loadBalance(account, contract);
      await loadAllTokenHolders(contract);
      
      setTransferAmount('');
      if (!toOwner) setRecipient('');
      
    } catch (error) {
      console.error("Transfer error:", error);
      alert('Transfer failed: ' + error.message);
    }
  };

  const handleCopyAddress = (address) => {
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
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
      
      // Refresh data setelah mint
      await loadBalance(account, contract);
      await loadAllTokenHolders(contract);
      
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
      
      // Refresh data setelah burn
      await loadBalance(account, contract);
      await loadAllTokenHolders(contract);
      
    } catch (error) {
      console.error("Burn error:", error);
      alert('Burn failed: ' + error.message);
    }
  };

  const handleRefreshHolders = async () => {
    if (contract) {
      await loadAllTokenHolders(contract);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-left">
          <h1>Robusta Token Dashboard</h1>
          <p className="contract-address">
            Contract: {CONTRACT_ADDRESS.substring(0, 10)}...{CONTRACT_ADDRESS.substring(CONTRACT_ADDRESS.length - 8)}
            <CopyToClipboard text={CONTRACT_ADDRESS} onCopy={() => handleCopyAddress('contract')}>
              <button className="copy-btn small">
                <FiCopy /> Copy
              </button>
            </CopyToClipboard>
          </p>
        </div>
        
        <div className="wallet-section">
          {!account ? (
            <button onClick={connectWallet} className="connect-btn">
              Connect Wallet
            </button>
          ) : (
            <div className="account-info">
              <div className="status-badge">
                {isOwner ? '👑 Owner' : '👤 User'}
              </div>
              <p className="account-address">
                {account.substring(0, 6)}...{account.substring(account.length - 4)}
                <CopyToClipboard text={account} onCopy={() => handleCopyAddress(account)}>
                  <button className="copy-btn">
                    <FiCopy />
                  </button>
                </CopyToClipboard>
                {copiedAddress === account && <span className="copied-text">Copied!</span>}
              </p>
              <p className="token-balance">
                Balance: <span className="balance-amount">{formatBalance(balance, 4)}</span> TR
              </p>
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
              <p>{formatNumber(tokenInfo.totalSupply)} TR</p>
            </div>
            <div className="info-card">
              <h3>Tax Fee</h3>
              <p>{tokenInfo.taxFee} per transfer</p>
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
                disabled={!account}
              >
                Transfer to Address
              </button>
              <button 
                onClick={() => handleTransfer(true)}
                className="transfer-owner-btn"
                disabled={!account}
              >
                Transfer to Owner (with tax)
              </button>
            </div>
            <p className="tax-notice">
              Note: All transfers include {tokenInfo.taxFee} tax fee
            </p>
          </div>
        </section>

        <section className="holders-section">
          <div className="section-header">
            <h2>Token Holders ({holdersCount})</h2>
            <div className="controls">
              <div className="search-box">
                <FiSearch className="search-icon" />
                <input
                  type="text"
                  placeholder="Filter by address..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
                {searchTerm && (
                  <button 
                    className="clear-search"
                    onClick={() => setSearchTerm('')}
                  >
                    ×
                  </button>
                )}
              </div>
              <button 
                onClick={handleRefreshHolders}
                className="refresh-btn"
                disabled={loadingHolders}
              >
                <FiRefreshCw className={loadingHolders ? 'spinning' : ''} />
                Refresh
              </button>
            </div>
          </div>
          
          {loadingHolders ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Loading token holders...</p>
            </div>
          ) : filteredHolders.length > 0 ? (
            <>
              <div className="table-container">
                <table className="holders-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Address</th>
                      <th>Balance (TR)</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllHolders ? filteredHolders : filteredHolders.slice(0, 10)).map((holder, index) => (
                      <tr key={holder.address}>
                        <td className="rank">{index + 1}</td>
                        <td className="address-cell">
                          <span className="full-address" title={holder.address}>
                            {holder.formattedAddress}
                          </span>
                          {holder.address.toLowerCase() === account?.toLowerCase() && (
                            <span className="you-badge">(You)</span>
                          )}
                          {holder.address.toLowerCase() === tokenInfo.owner?.toLowerCase() && (
                            <span className="owner-badge">(Owner)</span>
                          )}
                        </td>
                        <td className="balance-cell">
                          {holder.balanceFormatted}
                        </td>
                        <td className="actions-cell">
                          <CopyToClipboard 
                            text={holder.address} 
                            onCopy={() => handleCopyAddress(holder.address)}
                          >
                            <button className="icon-btn copy">
                              <FiCopy />
                              {copiedAddress === holder.address && (
                                <span className="tooltip">Copied!</span>
                              )}
                            </button>
                          </CopyToClipboard>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {filteredHolders.length > 10 && (
                <div className="show-more">
                  <button 
                    onClick={() => setShowAllHolders(!showAllHolders)}
                    className="show-more-btn"
                  >
                    {showAllHolders ? 'Show Less' : `Show All (${filteredHolders.length})`}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="no-data">
              <p>No token holders found {searchTerm && `for "${searchTerm}"`}</p>
              {searchTerm && (
                <button 
                  className="clear-filter-btn"
                  onClick={() => setSearchTerm('')}
                >
                  Clear Filter
                </button>
              )}
            </div>
          )}
          
          <div className="holders-note">
            <p>💡 Token holders list updates automatically after every transfer</p>
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
            </div>
          </section>
        )}
      </main>

      <footer className="App-footer">
        <p>Robusta Token (TR) • Sepolia Testnet</p>
        <p>Max Supply: {formatNumber("7000000")} TR • Decimals: 4</p>
        <p className="footer-note">
          Token holders are publicly accessible. Real-time updates on transfers.
        </p>
      </footer>
    </div>
  );
};

export default App;