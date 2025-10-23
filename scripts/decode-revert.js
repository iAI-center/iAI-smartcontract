(async () => {
    const ethers = await import('ethers');
    const data = '0xfb8f41b20000000000000000000000004ac009c4a567e7fee19c35c5d72779cca09f90d5000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000d529ae9e860000';
    const iface = new ethers.Interface(['error ERC20InsufficientAllowance(address spender,uint256 allowance,uint256 needed)']);
    try {
        const parsed = iface.parseError(data);
        console.log('error name:', parsed.name);
        console.log('args:', parsed.args);
    } catch (e) {
        console.error('failed to parse:', e);
    }
})();
