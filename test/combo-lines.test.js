const test = require('node:test');
const assert = require('node:assert/strict');
const { isComboItem, buildComboComponentsHtml } = require('../combo-lines');

const comboItem = {
  productName: 'Combo 2 pods',
  quantity: 2,
  isCombo: true,
  comboId: 'c1',
  comboSnapshot: {
    comboName: 'Combo 2 pods',
    items: [
      { productName: 'Pod Ignite', quantity: 1, variation: 'Menta' },
      { productName: 'Pod <Elf>', quantity: 2, variation: null },
    ],
  },
};

test('lista as peças do combo com quantidade × quantidade de combos e a variação', () => {
  const html = buildComboComponentsHtml(comboItem, 2);
  assert.match(html, /• 2x Pod Ignite \(Menta\)<br\/>/);
  assert.match(html, /• 4x Pod &lt;Elf&gt;<br\/>/);
});

test('item comum não ganha linhas de peças', () => {
  const item = { productName: 'Pod', quantity: 1, variation: 'Uva' };
  assert.equal(isComboItem(item), false);
  assert.equal(buildComboComponentsHtml(item, 1), '');
});

test('combo sem cópia das peças não quebra o cupom', () => {
  assert.equal(buildComboComponentsHtml({ isCombo: true, comboSnapshot: null }, 1), '');
});
