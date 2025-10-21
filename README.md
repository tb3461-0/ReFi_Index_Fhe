# ReFi Index: A Decentralized ESG Investment Fund

ReFi Index is a groundbreaking decentralized index fund that specifically invests in companies with strong ESG (Environmental, Social, and Governance) performance, leveraging **Zama's Fully Homomorphic Encryption technology** to ensure robust data privacy and security. By utilizing advanced cryptographic techniques, we provide investors with a trustworthy, transparent, and privacy-preserving platform to invest in sustainable initiatives.

## Tackling the ESG Investment Challenge 🌍

Investors are increasingly concerned about the environmental and social impact of their investments. However, traditional investment approaches often lack transparency regarding the ESG performance of companies, leading to skepticism and limiting the potential for impactful investing. Furthermore, ensuring that sensitive ESG data remains confidential while still being accessible for evaluation poses a significant challenge.

## The FHE-Powered Solution 🔐

ReFi Index addresses these issues head-on by employing **Fully Homomorphic Encryption (FHE)**, facilitated by Zama's open-source libraries, such as **Concrete** and the **zama-fhe SDK**. This technology allows us to perform computations on encrypted data, enabling us to evaluate and rank company ESG data without exposing the underlying information. 

The result is a decentralized index fund governed by a DAO (Decentralized Autonomous Organization), where fund constituents are decided through privacy-preserving voting processes. This ensures that all stakeholder inputs are considered while maintaining confidentiality.

## Key Features ✨

- **FHE-Encrypted ESG Ratings:** Companies are rated on their ESG performance using FHE encryption, securing sensitive data against unauthorized access while allowing meaningful analysis.
  
- **DAO Governance:** The fund's portfolio is managed through a transparent, decentralized governance model, providing stakeholders with the power to influence investment decisions through confidential voting.

- **Trustworthy and Transparent Investment:** ReFi Index creates a credible channel for sustainable investing, giving users confidence that their investments contribute positively to society.

- **User Dashboard and Component Analysis:** Our intuitive dashboard provides users with insights on the fund’s performance and detailed analysis of constituent stocks, enhancing the investment experience.

## Technology Stack 🛠️

- Zama **Fully Homomorphic Encryption SDK**
  
- Node.js

- Hardhat for smart contract development

- Ethereum blockchain for deployment

## Directory Structure 📁

Here’s a glance at the project’s folder structure:

```
ReFi_Index_Fhe/
├── contracts/
│   └── ReFi_Index_Fhe.sol
├── scripts/
│   └── deploy.js
├── test/
│   └── ReFiIndex.test.js
├── package.json
└── README.md
```

## Installation Guide 🚀

To set up ReFi Index, follow these steps:

1. **Ensure you have Node.js installed.** If not, download and install it from [the official Node.js website](https://nodejs.org).

2. **Install Hardhat.** This can be done easily with npm:
   ```bash
   npm install --save-dev hardhat
   ```

3. **Install dependencies.** Navigate to your project directory and run the following command to fetch necessary libraries:
   ```bash
   npm install
   ```

4. **Include Zama FHE Libraries.** Make sure you add the Zama SDK dependencies in your `package.json`.

> **Important:** Do not use `git clone` or any URLs to access the project. Download the project files directly for proper setup.

## Build & Run Guide 🏗️

Once you have set up the project, you can build and run it with the following commands:

1. **Compile the smart contracts:**
   ```bash
   npx hardhat compile
   ```

2. **Run the tests to ensure everything is functioning properly:**
   ```bash
   npx hardhat test
   ```

3. **Deploy to the Ethereum network:**
   ```bash
   npx hardhat run scripts/deploy.js --network <your-network>
   ```

### Example Code Snippet 💻

Below is a simple code snippet demonstrating how to use Zama's FHE capabilities for encrypting ESG data:

```javascript
const { encrypt, decrypt } = require('zama-fhe-sdk');

// Sample ESG data
const esgData = {
    companyName: 'Eco Corp',
    esgScore: 85
};

// Encrypt the ESG data
const encryptedEsgData = encrypt(esgData);

// Now, you can perform computations on encryptedEsgData
// ...

// Decrypt the results for verification
const decryptedData = decrypt(encryptedEsgData);
console.log(decryptedData);
```

This snippet illustrates the data encryption and decryption process, ensuring that sensitive ESG information remains protected while allowing necessary computations.

## Acknowledgements 🙏

Powered by Zama, we extend our gratitude to their team for pioneering the revolutionary open-source tools and technologies that enable the development of confidential blockchain applications. The use of Zama's Fully Homomorphic Encryption is integral to ReFi Index's mission of making sustainable investing accessible and secure.

---

Join us in reshaping the future of investment with privacy and integrity at the core of our mission. Together, we can drive positive change through responsible investing. 🌱
