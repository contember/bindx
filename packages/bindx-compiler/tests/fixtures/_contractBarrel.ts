// A collector-contract component (ItemRepeater) re-exported through a barrel — the contract
// discovery must follow the `from` chain to reach its `withCollector(_, { children: itemOf })`.
export { ItemRepeater } from './_contractTargets.js'
