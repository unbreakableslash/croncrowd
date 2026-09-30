process.argv.splice(2, 0, 'demo');
await import('../bin/croncrowd.mjs');
