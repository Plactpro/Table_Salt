import fs from 'fs';

// === PATCH POS.TSX ===
const posFile = 'client/src/pages/modules/pos.tsx';
let code = fs.readFileSync(posFile, 'utf8');
const orig = code;

// 1. Add import for ModifierSelectionDialog
if (!code.includes('ModifierSelectionDialog')) {
  const imp = `import ModifierSelectionDialog, { SelectedModifier } from "@/components/pos/ModifierSelectionDialog";\n`;
  const lastIdx = code.lastIndexOf('import ');
  const eol = code.indexOf('\n', lastIdx);
  code = code.slice(0, eol + 1) + imp + code.slice(eol + 1);
  console.log('[OK] Added ModifierSelectionDialog import');
}

// 2. Add state variables
if (!code.includes('modifierDialogOpen')) {
  const anchor = 'const [modifierItem, setModifierItem] = useState<CartItem | null>(null);';
  if (code.includes(anchor)) {
    const ins = `\n  const [modifierDialogOpen, setModifierDialogOpen] = useState(false);\n  const [pendingMenuItem, setPendingMenuItem] = useState<any>(null);`;
    code = code.replace(anchor, anchor + ins);
    console.log('[OK] Added state variables');
  } else { console.log('[WARN] modifierItem anchor not found'); }
}

// 3. Add handleModifierConfirm before addToCart
if (!code.includes('handleModifierConfirm')) {
  const anchor = 'const addToCart = useCallback((item: MenuItem) => {';
  if (code.includes(anchor)) {
    const fn = `  const handleModifierConfirm = (modifiers: SelectedModifier[], totalAdjustment: number) => {
    if (!pendingMenuItem) return;
    const baseP = parseFloat(String(pendingMenuItem.price));
    const cartMods: any[] = modifiers.map(m => ({ type: "modifier-group" as const, label: m.optionName, priceAdjust: m.priceAdjustment, groupId: m.groupId, groupName: m.groupName, optionId: m.optionId, optionName: m.optionName }));
    setCart(prev => {
      const cartKey = Math.random().toString(36).substr(2, 9);
      return [...prev, {
        menuItemId: pendingMenuItem.id,
        name: pendingMenuItem.name,
        price: baseP + totalAdjustment,
        basePrice: baseP,
        quantity: 1,
        notes: "",
        isVeg: pendingMenuItem.isVeg ?? null,
        categoryId: pendingMenuItem.categoryId ?? null,
        cartKey,
        hsnCode: pendingMenuItem.hsnCode || null,
        modifiers: cartMods.length > 0 ? cartMods : undefined,
      }];
    });
    setPendingMenuItem(null);
  };

  `;
    code = code.replace(anchor, fn + anchor);
    console.log('[OK] Added handleModifierConfirm');
  } else { console.log('[WARN] addToCart anchor not found'); }
}

// 4. Intercept addToCart with modifier dialog
if (!code.includes('setPendingMenuItem(item); setModifierDialogOpen(true)')) {
  const old4 = 'e.stopPropagation(); addToCart(item);';
  if (code.includes(old4)) {
    code = code.replace(old4, 'e.stopPropagation(); setPendingMenuItem(item); setModifierDialogOpen(true);');
    console.log('[OK] Intercepted addToCart');
  } else { console.log('[WARN] addToCart intercept pattern not found'); }
}

// 5. Add modifiers to order items mapping
const old5 = 'menuItemId: c.menuItemId, name: c.name, price: c.price, quantity: c.quantity, categoryId: c.categoryId || undefined';
if (!code.includes('modifiers: c.modifiers')) {
  if (code.includes(old5)) {
    code = code.replace(old5, old5 + `, modifiers: c.modifiers?.filter((m: any) => m.type === "modifier-group").map((m: any) => ({ groupId: m.groupId, groupName: m.groupName, optionId: m.optionId, optionName: m.optionName || m.label, priceAdjustment: m.priceAdjust })) || []`);
    console.log('[OK] Added modifiers to order items');
  } else { console.log('[WARN] order items mapping not found'); }
}

// 6. Add dialog JSX
if (!code.includes('<ModifierSelectionDialog')) {
  const anchor6 = '</BillPreviewModal>';
  if (code.includes(anchor6)) {
    code = code.replace(anchor6, anchor6 + `\n      <ModifierSelectionDialog open={modifierDialogOpen} onOpenChange={setModifierDialogOpen} menuItem={pendingMenuItem} onConfirm={handleModifierConfirm} currency="AED" />`);
    console.log('[OK] Added dialog JSX');
  } else { console.log('[WARN] BillPreviewModal anchor not found'); }
}

if (code !== orig) {
  fs.writeFileSync(posFile, code);
  console.log('[DONE] pos.tsx patched');
} else {
  console.log('[SKIP] pos.tsx no changes');
}

// === PATCH KDS ===
const kdsFile = 'client/src/pages/dashboards/kitchen-board.tsx';
let kds = fs.readFileSync(kdsFile, 'utf8');
const kdsOrig = kds;

if (!kds.includes('modifier-group-kds')) {
  const anchor7 = '<span className="font-semibold text-sm">{item.name}</span>';
  if (kds.includes(anchor7)) {
    const modDisplay = `<span className="font-semibold text-sm">{item.name}</span>
                    {item.modifiers && Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                      <div className="mt-0.5 space-y-0.5" data-testid="modifier-group-kds">
                        {(item.modifiers as any[]).map((mod: any, idx: number) => (
                          <div key={idx} className="text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                            {"\u2192"} {mod.optionName || mod.label}
                          </div>
                        ))}
                      </div>
                    )}`;
    kds = kds.replace(anchor7, modDisplay);
    console.log('[OK] Added modifier display to KDS');
  } else { console.log('[WARN] KDS item.name anchor not found'); }
}

if (kds !== kdsOrig) {
  fs.writeFileSync(kdsFile, kds);
  console.log('[DONE] kitchen-board.tsx patched');
} else {
  console.log('[SKIP] kitchen-board.tsx no changes');
}

console.log('\nAll done. Run: npm run build 2>&1 | tail -20');
