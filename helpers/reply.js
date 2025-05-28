exports.generic = (msg) => ({ content: msg });
exports.dolar   = (rateObj) => ({ content: `US$1 = R$${rateObj.rate}` });
exports.events  = (arr=[])  =>
  ({ content: arr.length ? arr.map(e=>e.name).join('\\n') : 'Nenhum evento.' });
exports.news    = (digest) => ({ content: digest });
