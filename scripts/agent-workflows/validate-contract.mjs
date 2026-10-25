import { main, argumentsOf, readJson } from './common.mjs';
import { validateContract } from './contracts.mjs';
main(import.meta.url,args=>{const o=argumentsOf(args);if(!o._[0])throw Error('Usage: validate-contract.mjs contract.json [--root checkout] [--state approved]');return validateContract(readJson(o._[0]),{root:o.root,expectedState:o.state});});
