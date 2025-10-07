const express = require('express');
const axios   = require('axios');
const crypto  = require('crypto');
const JSZip   = require('jszip');
const fs      = require('fs');
const cors    = require('cors');
const app     = express();
app.use(cors());
app.use(express.json());

const PRODUCTS = {199:'kit', 348:'kit+audit'};
const API_KEY    = process.env.NP_API_KEY;
const IPN_SECRET = process.env.IPN_SECRET;
const HOST       = `https://${process.env.PROJECT_DOMAIN}.onrender.com`;
const API_URL    = 'https://api.sandbox.nowpayments.io/v1';   // swap to https://api.nowpayments.io/v1 when live

// health check
app.get('/', (req,res)=>res.send('API ok'));

// create invoice
app.post('/create-invoice', async (req,res)=>{
  const amount = req.body.price;
  if(!PRODUCTS[amount]) return res.status(400).json({error:'bad price'});
  const orderId = Date.now().toString();
  const body = { price_amount:amount, price_currency:'usd', pay_currency:'usdttrc20',
                 order_id:orderId, ipn_callback_url:HOST+'/webhook',
                 success_url:HOST+'/success', cancel_url:HOST };
  try{
    const {data} = await axios.post(API_URL+'/invoice', body, {headers:{'x-api-key':API_KEY}});
    res.json({pay_url:data.invoice_url});
  }catch(e){ res.status(500).json({error:e.message}); }
});

// webhook
app.post('/webhook', (req,res)=>{
  const sig = req.headers['x-nowpayments-sig'];
  const hash = crypto.createHmac('sha512', IPN_SECRET).update(JSON.stringify(req.body)).digest('hex');
  if(sig!==hash) return res.status(400).send('bad sig');
  if(req.body.payment_status==='finished'){
     const tok = crypto.randomBytes(8).toString('hex');
     fs.mkdirSync('./tokens',{recursive:true});
     fs.writeFileSync(`./tokens/${req.body.order_id}.txt`, tok);
  }
  res.send('ok');
});

// download
app.get('/download/:order/:token', (req,res)=>{
  try{
    const tok = fs.readFileSync(`./tokens/${req.params.order}.txt`,'utf8');
    if(tok!==req.params.token) return res.status(404).send('invalid');
  }catch{ return res.status(404).send('expired'); }
  const zip = new JSZip();
  zip.file('README.txt', 'Thanks for buying! Unzip → open index.html.');
  zip.file('index.html', fs.readFileSync('./public/index.html'));
  zip.file('style.css',  fs.readFileSync('./public/style.css'));
  zip.file('server.js',  fs.readFileSync('./server.js'));
  if(fs.existsSync('./public/ai_audit_sample.pdf'))
     zip.file('AI-Audit-Sample.pdf', fs.readFileSync('./public/ai_audit_sample.pdf'));
  zip.generateNodeStream({type:'nodebuffer',streamFiles:true})
     .pipe(res).attachment('crypto-kit.zip');
});

// success page
app.get('/success', (req,res)=>
  res.send('<h3>Payment complete!</h3><p>Your download should start automatically.</p>'));

// keep-alive (Render free spins down after 15 min)
setInterval(()=> axios.get(HOST).catch(()=>{}), 10*60*1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`API live on ${PORT}`));
