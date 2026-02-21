import { formatCurrency } from './utils';

interface ReceiptItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface ReceiptData {
  saleId: string;
  date: string;
  items: ReceiptItem[];
  total: number;
  paymentMethod: string;
  customerName?: string;
  vendorName?: string;
  shopName?: string;
}

function buildReceiptHtml(data: ReceiptData): string {
  const shop = data.shopName || 'GestionStore';
  const dateStr = new Date(data.date).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const itemsHtml = data.items.map((item) => `
    <tr>
      <td style="text-align:left;padding:2px 0">${item.productName}</td>
      <td style="text-align:center;padding:2px 4px">${item.quantity}</td>
      <td style="text-align:right;padding:2px 0">${formatCurrency(item.unitPrice)}</td>
      <td style="text-align:right;padding:2px 0">${formatCurrency(item.total)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${shop} - Reçu ${dateStr.replace(/\//g, '-')}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; margin: 0 auto; padding: 8mm 4mm; color: #000; background: #fff; }
    .center { text-align: center; }
    .shop { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .info { margin: 4px 0; }
    .info span { display: inline-block; }
    .label { color: #555; }
    table { width: 100%; border-collapse: collapse; margin: 4px 0; }
    th { text-align: left; border-bottom: 1px solid #000; padding: 2px 0; font-size: 11px; }
    th:nth-child(2) { text-align: center; }
    th:nth-child(3), th:nth-child(4) { text-align: right; }
    .total-row { border-top: 2px solid #000; }
    .total-row td { padding-top: 4px; font-weight: bold; font-size: 14px; }
    .footer { margin-top: 8px; font-size: 10px; color: #555; }
    @media print {
      body { width: 80mm; padding: 2mm; }
      @page { size: 80mm auto; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="center">
    <div class="shop">${shop}</div>
    <div style="font-size:10px;color:#555">Reçu de vente</div>
  </div>

  <div class="divider"></div>

  <div class="info">
    <span class="label">Réf :</span> #${data.saleId.slice(0, 8)}<br>
    <span class="label">Date :</span> ${dateStr}<br>
    <span class="label">Paiement :</span> ${data.paymentMethod}<br>
    ${data.customerName ? `<span class="label">Client :</span> ${data.customerName}<br>` : ''}
    ${data.vendorName ? `<span class="label">Vendeur :</span> ${data.vendorName}<br>` : ''}
  </div>

  <div class="divider"></div>

  <table>
    <thead>
      <tr><th>Article</th><th>Qté</th><th>P.U.</th><th>Total</th></tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <div class="divider"></div>

  <table>
    <tr class="total-row">
      <td colspan="3" style="text-align:right;padding-right:8px">TOTAL</td>
      <td style="text-align:right">${formatCurrency(data.total)}</td>
    </tr>
  </table>

  <div class="divider"></div>

  <div class="center footer">
    Merci pour votre achat !<br>
    ${shop}
  </div>
</body>
</html>`;
}

export function printReceipt(data: ReceiptData) {
  const html = buildReceiptHtml(data);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  iframe.style.left = '-10000px';
  iframe.style.width = '80mm';
  iframe.style.height = '0';
  iframe.src = url;

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 1000);
    }
  };

  document.body.appendChild(iframe);
}
