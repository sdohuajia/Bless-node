import crypto from 'crypto';
import fs from 'fs';
import readline from 'readline';
import chalk from 'chalk';

function getRandomHardwareIdentifier() {
    const randomCpuArchitecture = Math.random() > 0.5 ? 'x64' : 'x86';
    const randomCpuModel = `模拟CPU型号 ${Math.floor(Math.random() * 1000)}`;
    const randomNumOfProcessors = Math.floor(Math.random() * 8) + 1;
    const randomTotalMemory = Math.floor(Math.random() * 16 + 1) * 1024 * 1024 * 1024;

    const cpuInfo = {
        cpuArchitecture: randomCpuArchitecture,
        cpuModel: randomCpuModel,
        numOfProcessors: randomNumOfProcessors,
        totalMemory: randomTotalMemory
    };

    return Buffer.from(JSON.stringify(cpuInfo)).toString('base64');
}

async function generateDeviceIdentifier() {
    const hardwareIdentifier = getRandomHardwareIdentifier();
    const deviceInfo = JSON.stringify({ hardware: hardwareIdentifier });
    const hash = crypto.createHash('sha256');
    hash.update(deviceInfo);
    return hash.digest('hex');
}

function generatePubKey(length = 52) {
    const prefix = "12D3KooW";
    const remainingLength = length - prefix.length;
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let remainingChars = '';

    for (let i = 0; i < remainingLength; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        remainingChars += characters[randomIndex];
    }

    return prefix + remainingChars;
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function main() {
    console.log(chalk.red.bold('此工具仅供测试使用，不建议实际应用'));

    rl.question(chalk.cyan('请输入要生成的标识符数量: '), async (answer) => {
        const total = parseInt(answer);
        let output = '';

        for (let i = 0; i < total; i++) {
            const deviceIdentifier = await generateDeviceIdentifier();
            const publicKey = generatePubKey();

            const logEntry = `设备标识符 ${i + 1}: ${chalk.green(deviceIdentifier)}\n公钥 ${i + 1}: ${chalk.blue(publicKey)}\n`;
            const formattedEntry = `${publicKey}:${deviceIdentifier}\n`;
            output += formattedEntry;
            console.log(logEntry);
        }

        fs.writeFileSync('output.txt', output);
        console.log(chalk.yellow('数据已保存到 output.txt'));

        rl.close();
    });
}

main();
