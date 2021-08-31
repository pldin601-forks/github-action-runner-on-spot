export interface InstanceSet {
  name: string
  region: string
  price: string
}

export const onDemandPriceDB: Map<string, InstanceSet[]> = new Map()

onDemandPriceDB.set('t3.large', [
  { name: 't3.large', region: 'us-east1', price: '0.0522' }
])

onDemandPriceDB.set('t3.xlarge', [
  { name: 't3.xlarge', region: 'us-east1', price: '0.1664' }
])

onDemandPriceDB.set('t3.2xlarge', [
  { name: 't3.2xlarge', region: 'us-east1', price: '0.3328' }
])

onDemandPriceDB.set('m5.large', [
  { name: 'm5.large', region: 'us-east1', price: '0.096' }
])

onDemandPriceDB.set('m5.xlarge', [
  { name: 'm5.xlarge', region: 'us-east1', price: '0.192' }
])

onDemandPriceDB.set('m5.2xlarge', [
  { name: 'm5.2xlarge', region: 'us-east1', price: '0.384' }
])

onDemandPriceDB.set('m5.4xlarge', [
  { name: 'm5.4xlarge', region: 'us-east1', price: '0.768' }
])

onDemandPriceDB.set('c5.large', [
  { name: 'c5.large', region: 'us-east1', price: '0.054' }
])

onDemandPriceDB.set('c5.xlarge', [
  { name: 'c5xlarge', region: 'us-east1', price: '0.085' }
])

onDemandPriceDB.set('c5.2xlarge', [
  { name: 'c5.2xlarge', region: 'us-east1', price: '0.34' }
])

onDemandPriceDB.set('c5.4xlarge', [
  { name: 'c5.4xlarge', region: 'us-east1', price: '0.68' }
])
