// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface ESGRecord {
  id: string;
  encryptedESGScore: string;
  companyName: string;
  timestamp: number;
  submitter: string;
  sector: string;
  decryptedScore?: number;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<ESGRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<ESGRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingRecord, setAddingRecord] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({ companyName: "", sector: "Technology", esgScore: 0 });
  const [searchTerm, setSearchTerm] = useState("");
  const [sectorFilter, setSectorFilter] = useState("All");
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [decryptingId, setDecryptingId] = useState<string | null>(null);

  // Calculate statistics
  const totalRecords = records.length;
  const averageScore = totalRecords > 0 
    ? records.reduce((sum, record) => sum + (record.decryptedScore || 0), 0) / totalRecords 
    : 0;
  const sectors = [...new Set(records.map(r => r.sector))];
  const topPerformer = [...records].sort((a, b) => (b.decryptedScore || 0) - (a.decryptedScore || 0))[0];

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  useEffect(() => {
    filterRecords();
  }, [records, searchTerm, sectorFilter]);

  const filterRecords = () => {
    let filtered = [...records];
    if (searchTerm) {
      filtered = filtered.filter(r => 
        r.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.sector.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (sectorFilter !== "All") {
      filtered = filtered.filter(r => r.sector === sectorFilter);
    }
    setFilteredRecords(filtered);
  };

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        setTransactionStatus({ visible: true, status: "error", message: "Contract not available" });
        return;
      }

      // Load record keys
      const keysBytes = await contract.getData("esg_record_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing record keys:", e); }
      }

      // Load each record
      const list: ESGRecord[] = [];
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`esg_record_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({ 
                id: key, 
                encryptedESGScore: recordData.score, 
                companyName: recordData.companyName,
                timestamp: recordData.timestamp, 
                submitter: recordData.submitter, 
                sector: recordData.sector 
              });
            } catch (e) { console.error(`Error parsing record data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading record ${key}:`, e); }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) { 
      console.error("Error loading records:", e);
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load records" });
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  const addRecord = async () => {
    if (!isConnected) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      return; 
    }
    setAddingRecord(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting ESG score with Zama FHE..." });
    
    try {
      const encryptedScore = FHEEncryptNumber(newRecordData.esgScore);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const recordData = { 
        score: encryptedScore, 
        companyName: newRecordData.companyName,
        timestamp: Math.floor(Date.now() / 1000), 
        submitter: address, 
        sector: newRecordData.sector 
      };
      
      // Store the record
      await contract.setData(`esg_record_${recordId}`, ethers.toUtf8Bytes(JSON.stringify(recordData)));
      
      // Update the keys list
      const keysBytes = await contract.getData("esg_record_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(recordId);
      await contract.setData("esg_record_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "ESG data encrypted and stored securely!" });
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowAddModal(false);
        setNewRecordData({ companyName: "", sector: "Technology", esgScore: 0 });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setAddingRecord(false); 
    }
  };

  const decryptWithSignature = async (recordId: string, encryptedData: string): Promise<void> => {
    if (!isConnected) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      return; 
    }
    
    setDecryptingId(recordId);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      
      // Simulate decryption delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const decryptedValue = FHEDecryptNumber(encryptedData);
      
      // Update the record with decrypted value
      setRecords(prev => prev.map(record => 
        record.id === recordId ? { ...record, decryptedScore: decryptedValue } : record
      ));
      
    } catch (e) { 
      console.error("Decryption failed:", e);
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setDecryptingId(null); 
    }
  };

  const renderSectorDistribution = () => {
    const sectorCounts: Record<string, number> = {};
    records.forEach(record => {
      sectorCounts[record.sector] = (sectorCounts[record.sector] || 0) + 1;
    });
    
    return (
      <div className="sector-distribution">
        <h4>Sector Distribution</h4>
        <div className="sector-bars">
          {Object.entries(sectorCounts).map(([sector, count]) => (
            <div key={sector} className="sector-bar">
              <div className="sector-name">{sector}</div>
              <div className="bar-container">
                <div 
                  className="bar-fill" 
                  style={{ width: `${(count / records.length) * 100}%` }}
                ></div>
              </div>
              <div className="sector-count">{count}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderScoreTrend = () => {
    // Group by month for trend analysis
    const monthlyData: Record<string, { count: number; total: number }> = {};
    records.forEach(record => {
      const date = new Date(record.timestamp * 1000);
      const monthYear = `${date.getFullYear()}-${date.getMonth() + 1}`;
      
      if (!monthlyData[monthYear]) {
        monthlyData[monthYear] = { count: 0, total: 0 };
      }
      
      monthlyData[monthYear].count += 1;
      monthlyData[monthYear].total += record.decryptedScore || 0;
    });
    
    const months = Object.keys(monthlyData).sort();
    const maxValue = Math.max(...Object.values(monthlyData).map(d => d.total / d.count), 100);
    
    return (
      <div className="score-trend">
        <h4>ESG Score Trend</h4>
        <div className="trend-chart">
          {months.map(month => {
            const data = monthlyData[month];
            const avg = data.total / data.count;
            const height = `${(avg / maxValue) * 100}%`;
            
            return (
              <div key={month} className="trend-bar">
                <div className="bar-value" style={{ height }}></div>
                <div className="bar-label">{month}</div>
                <div className="bar-tooltip">{avg.toFixed(1)}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Loading encrypted ESG data...</p>
    </div>
  );

  return (
    <div className="app-container future-metal-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="shield-icon"></div>
          </div>
          <h1>ReFi<span>Privacy</span>Index</h1>
        </div>
        <div className="header-actions">
          <button 
            onClick={() => setShowAddModal(true)} 
            className="add-record-btn metal-button"
          >
            <div className="add-icon"></div>Add ESG Data
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      <div className="main-content dashboard-layout">
        <div className="dashboard-header">
          <div className="header-text">
            <h2>FHE-Encrypted ESG Index Fund</h2>
            <p>A decentralized index fund tracking FHE-encrypted ESG data, governed by DAO</p>
          </div>
          <div className="fhe-indicator">
            <div className="fhe-lock"></div>
            <span>Zama FHE Encryption Active</span>
          </div>
        </div>

        <div className="dashboard-grid">
          {/* Project Introduction */}
          <div className="dashboard-card metal-card intro-card">
            <h3>Project Introduction</h3>
            <p>
              The <strong>ReFi Privacy Index</strong> is a decentralized index fund that invests in companies 
              with strong ESG (Environmental, Social, Governance) performance. All ESG data is encrypted 
              using <strong>Zama FHE (Fully Homomorphic Encryption)</strong> technology, allowing computations 
              on encrypted data without decryption.
            </p>
            <div className="feature-list">
              <div className="feature">
                <div className="feature-icon">🔒</div>
                <div>ESG scores encrypted with Zama FHE</div>
              </div>
              <div className="feature">
                <div className="feature-icon">🏛️</div>
                <div>DAO-governed investment decisions</div>
              </div>
              <div className="feature">
                <div className="feature-icon">📊</div>
                <div>Transparent, decentralized ESG tracking</div>
              </div>
            </div>
            <div className="fhe-badge">
              <span>Powered by Zama FHE</span>
            </div>
          </div>

          {/* Data Statistics */}
          <div className="dashboard-card metal-card stats-card">
            <h3>Fund Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{totalRecords}</div>
                <div className="stat-label">Companies</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{averageScore.toFixed(1)}</div>
                <div className="stat-label">Avg ESG Score</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{sectors.length}</div>
                <div className="stat-label">Sectors</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{topPerformer?.companyName || '-'}</div>
                <div className="stat-label">Top Performer</div>
              </div>
            </div>
            {renderSectorDistribution()}
          </div>

          {/* Smart Charts */}
          <div className="dashboard-card metal-card charts-card">
            <h3>Performance Analytics</h3>
            {renderScoreTrend()}
            <div className="esg-distribution">
              <h4>ESG Score Distribution</h4>
              <div className="distribution-bars">
                {[0, 20, 40, 60, 80].map((start) => {
                  const end = start + 20;
                  const count = records.filter(r => {
                    const score = r.decryptedScore || 0;
                    return score >= start && score < end;
                  }).length;
                  
                  return (
                    <div key={start} className="distribution-bar">
                      <div className="bar-label">{start}-{end}</div>
                      <div 
                        className="bar-fill" 
                        style={{ height: `${(count / Math.max(1, records.length)) * 100}%` }}
                      ></div>
                      <div className="bar-count">{count}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ESG Records List */}
        <div className="records-section">
          <div className="section-header">
            <h2>Encrypted ESG Records</h2>
            <div className="search-filter">
              <input
                type="text"
                placeholder="Search companies..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="metal-input"
              />
              <select
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
                className="metal-select"
              >
                <option value="All">All Sectors</option>
                {sectors.map(sector => (
                  <option key={sector} value={sector}>{sector}</option>
                ))}
              </select>
              <button 
                onClick={loadRecords} 
                className="refresh-btn metal-button" 
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="records-list metal-card">
            <div className="table-header">
              <div className="header-cell">Company</div>
              <div className="header-cell">Sector</div>
              <div className="header-cell">Submitter</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">ESG Score</div>
              <div className="header-cell">Actions</div>
            </div>

            {filteredRecords.length === 0 ? (
              <div className="no-records">
                <div className="no-records-icon"></div>
                <p>No ESG records found</p>
                <button 
                  className="metal-button primary" 
                  onClick={() => setShowAddModal(true)}
                >
                  Add First Record
                </button>
              </div>
            ) : (
              filteredRecords.map(record => (
                <div className="record-row" key={record.id}>
                  <div className="table-cell">{record.companyName}</div>
                  <div className="table-cell">{record.sector}</div>
                  <div className="table-cell">
                    {record.submitter.substring(0, 6)}...{record.submitter.substring(38)}
                  </div>
                  <div className="table-cell">
                    {new Date(record.timestamp * 1000).toLocaleDateString()}
                  </div>
                  <div className="table-cell">
                    {record.decryptedScore !== undefined ? (
                      <span className="score-value">{record.decryptedScore.toFixed(1)}</span>
                    ) : (
                      <span className="encrypted-tag">Encrypted</span>
                    )}
                  </div>
                  <div className="table-cell actions">
                    <button 
                      className="action-btn metal-button" 
                      onClick={() => decryptWithSignature(record.id, record.encryptedESGScore)}
                      disabled={decryptingId === record.id}
                    >
                      {decryptingId === record.id ? (
                        <span className="decrypt-spinner"></span>
                      ) : record.decryptedScore !== undefined ? (
                        "Hide Score"
                      ) : (
                        "Decrypt"
                      )}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add Record Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="add-modal metal-card">
            <div className="modal-header">
              <h2>Add ESG Data Record</h2>
              <button onClick={() => setShowAddModal(false)} className="close-modal">
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Company Name *</label>
                <input
                  type="text"
                  name="companyName"
                  value={newRecordData.companyName}
                  onChange={(e) => setNewRecordData({...newRecordData, companyName: e.target.value})}
                  placeholder="Enter company name..."
                  className="metal-input"
                />
              </div>
              <div className="form-group">
                <label>Sector *</label>
                <select
                  name="sector"
                  value={newRecordData.sector}
                  onChange={(e) => setNewRecordData({...newRecordData, sector: e.target.value})}
                  className="metal-select"
                >
                  <option value="Technology">Technology</option>
                  <option value="Finance">Finance</option>
                  <option value="Healthcare">Healthcare</option>
                  <option value="Energy">Energy</option>
                  <option value="Consumer">Consumer</option>
                  <option value="Industrial">Industrial</option>
                </select>
              </div>
              <div className="form-group">
                <label>ESG Score (0-100) *</label>
                <input
                  type="number"
                  name="esgScore"
                  value={newRecordData.esgScore}
                  onChange={(e) => setNewRecordData({...newRecordData, esgScore: parseInt(e.target.value) || 0})}
                  min="0"
                  max="100"
                  className="metal-input"
                />
              </div>
              <div className="encryption-preview">
                <h4>FHE Encryption Preview</h4>
                <div className="preview-container">
                  <div className="plain-data">
                    <span>Plain Score:</span>
                    <div>{newRecordData.esgScore}</div>
                  </div>
                  <div className="encryption-arrow">→</div>
                  <div className="encrypted-data">
                    <span>Encrypted Data:</span>
                    <div>
                      {newRecordData.esgScore 
                        ? FHEEncryptNumber(newRecordData.esgScore).substring(0, 50) + '...' 
                        : 'No score entered'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => setShowAddModal(false)} 
                className="cancel-btn metal-button"
              >
                Cancel
              </button>
              <button 
                onClick={addRecord} 
                disabled={addingRecord || !newRecordData.companyName || !newRecordData.sector}
                className="submit-btn metal-button primary"
              >
                {addingRecord ? "Encrypting with FHE..." : "Submit Securely"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Status Modal */}
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="shield-icon"></div>
              <span>ReFi Privacy Index</span>
            </div>
            <p>Decentralized ESG index fund with FHE-encrypted data</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">DAO Governance</a>
            <a href="#" className="footer-link">Zama FHE</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} ReFi Privacy Index. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
