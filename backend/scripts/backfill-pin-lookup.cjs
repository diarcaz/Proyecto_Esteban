// Explicit maintenance command. No automatic reset, no secrets in output.
const {PrismaClient}=require('@prisma/client');
const {backfillPinLookup}=require('../dist/infrastructure/security/pin-lookup-backfill');
async function main(){
  const args=process.argv.slice(2),position=args.indexOf('--database');
  if(position<0 || !args[position+1] || args.some((arg,i)=>!['--database','--apply'].includes(arg)&&i!==position+1))throw Error('Invalid arguments');
  const expected=args[position+1];
  const prisma=new PrismaClient({log:[]});
  try{
    const rows=await prisma.$queryRawUnsafe('SELECT current_database() AS name');
    if(rows[0]?.name!==expected)throw Error('Database mismatch');
    console.log(JSON.stringify(await backfillPinLookup(prisma,args.includes('--apply'))));
  }finally{await prisma.$disconnect();}
}
main().catch(()=>{console.error('PIN enrollment failed. Check the target database, lookup/encryption keys and duplicate PIN assignments. No credentials are printed.');process.exitCode=1;});
