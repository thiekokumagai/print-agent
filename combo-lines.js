/**
 * Peças de um item de combo no cupom: cada peça sai abaixo do combo com
 * quantidade da peça × quantidade de combos e a variação, para separar o pedido.
 */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getComboComponents(item) {
  const snapshot = item && item.comboSnapshot;
  if (!snapshot) return null;
  const components = snapshot.items || snapshot.components;
  return Array.isArray(components) && components.length > 0 ? components : null;
}

function isComboItem(item) {
  return Boolean(item && (item.isCombo || item.comboId || getComboComponents(item)));
}

/** HTML das peças do combo (vazio quando o item não é combo ou não tem a cópia das peças). */
function buildComboComponentsHtml(item, comboQuantity) {
  const components = isComboItem(item) ? getComboComponents(item) : null;
  if (!components) return '';

  const qtd = Number(comboQuantity) > 0 ? Number(comboQuantity) : 1;
  const lines = components.map((comp) => {
    const compQtd = (Number(comp.quantity) || 1) * qtd;
    const name = escapeHtml(comp.productName || 'Produto');
    const variation = comp.variation ? ` (${escapeHtml(comp.variation)})` : '';
    return `• ${compQtd}x ${name}${variation}<br/>`;
  });

  return `<div style="font-size: 11px; padding-left: 8px; margin-top: 2px; color: #333;">${lines.join('')}</div>`;
}

module.exports = { isComboItem, buildComboComponentsHtml };
