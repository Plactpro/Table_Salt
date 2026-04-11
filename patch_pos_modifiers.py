#!/usr/bin/env python3
"""Patch pos.tsx and kitchen-board.tsx for modifier groups support."""
import re, sys

def patch_pos():
    f = 'client/src/pages/modules/pos.tsx'
    with open(f, 'r') as fh:
        code = fh.read()
    orig = code

    # 1. Add import for ModifierSelectionDialog after last import
    if 'ModifierSelectionDialog' not in code:
        imp = 'import ModifierSelectionDialog, { SelectedModifier } from "@/components/pos/ModifierSelectionDialog";\n'
        # Insert after the last import statement
        last_import = code.rfind('import ')
        end_of_line = code.index('\n', last_import)
        code = code[:end_of_line+1] + imp + code[end_of_line+1:]
        print('[OK] Added ModifierSelectionDialog import')

    # 2. Add state variables for modifier dialog after existing modifier state
    if 'modifierDialogOpen' not in code:
        anchor = 'const [modifierItem, setModifierItem] = useState<CartItem | null>(null);'
        if anchor in code:
            insert = '\n  const [modifierDialogOpen, setModifierDialogOpen] = useState(false);\n  const [pendingMenuItem, setPendingMenuItem] = useState<any>(null);'
            code = code.replace(anchor, anchor + insert)
            print('[OK] Added modifierDialogOpen + pendingMenuItem state')
        else:
            print('[WARN] Could not find modifierItem state anchor')

    # 3. Add handleModifierConfirm function after addToCart
    if 'handleModifierConfirm' not in code:
        anchor = 'const addToCart = useCallback((item: MenuItem) => {'
        if anchor in code:
            # Find the end of addToCart useCallback - look for the closing pattern
            # We'll add handleModifierConfirm just before addToCart definition
            insert = '''  const handleModifierConfirm = (modifiers: SelectedModifier[], totalAdjustment: number) => {
    if (!pendingMenuItem) return;
    const baseP = parseFloat(String(pendingMenuItem.price));
    const cartMods = modifiers.map(m => ({ type: "modifier-group" as const, label: m.optionName, priceAdjust: m.priceAdjustment, groupId: m.groupId, groupName: m.groupName, optionId: m.optionId, optionName: m.optionName }));
    setCart(prev => {
      const cartKey = Math.random().toString(36).substr(2, 9);
      return [...prev, {
        menuItemId: pendingMenuItem.id, name: pendingMenuItem.name,
        price: baseP + totalAdjustment, basePrice: baseP,
        quantity: 1, notes: "", isVeg: pendingMenuItem.isVeg ?? null,
        categoryId: pendingMenuItem.categoryId ?? null,
        cartKey, hsnCode: pendingMenuItem.hsnCode || null,
        modifiers: cartMods.length > 0 ? cartMods : undefined,
      }];
    });
    setPendingMenuItem(null);
  };

  '''
            code = code.replace(anchor, insert + anchor)
            print('[OK] Added handleModifierConfirm function')

    # 4. Intercept addToCart calls to check for modifiers
    # Replace direct addToCart(item) calls in the menu item click handlers
    # The pattern is: e.stopPropagation(); addToCart(item);
    if 'setPendingMenuItem(item); setModifierDialogOpen(true)' not in code:
        old_pattern = 'e.stopPropagation(); addToCart(item);'
        new_pattern = 'e.stopPropagation(); setPendingMenuItem(item); setModifierDialogOpen(true);'
        if old_pattern in code:
            code = code.replace(old_pattern, new_pattern, 1)  # Replace first occurrence only
            print('[OK] Intercepted first addToCart call with modifier dialog')
        else:
            print('[WARN] Could not find addToCart intercept pattern')

    # 5. Add modifiers to order items mapping
    # Find: menuItemId: c.menuItemId, name: c.name, price: c.price, quantity: c.quantity, categoryId: c.categoryId || undefined
    old_order = 'menuItemId: c.menuItemId, name: c.name, price: c.price, quantity: c.quantity, categoryId: c.categoryId || undefined'
    new_order = 'menuItemId: c.menuItemId, name: c.name, price: c.price, quantity: c.quantity, categoryId: c.categoryId || undefined, modifiers: c.modifiers?.filter(m => m.type === "modifier-group").map(m => ({ groupId: (m as any).groupId, groupName: (m as any).groupName, optionId: (m as any).optionId, optionName: (m as any).optionName || m.label, priceAdjustment: m.priceAdjust })) || []'
    if 'modifiers: c.modifiers?.filter' not in code:
        code = code.replace(old_order, new_order)
        print('[OK] Added modifiers to order items mapping')

    # 6. Add ModifierSelectionDialog JSX before the last closing tag
    if '<ModifierSelectionDialog' not in code:
        dialog_jsx = '''\n      <ModifierSelectionDialog
        open={modifierDialogOpen}
        onOpenChange={setModifierDialogOpen}
        menuItem={pendingMenuItem}
        onConfirm={handleModifierConfirm}
        currency="AED"
      />'''
        # Find a good anchor - the BillPreviewModal or a similar component near the end
        anchor = '</BillPreviewModal>'
        if anchor in code:
            code = code.replace(anchor, anchor + dialog_jsx, 1)
            print('[OK] Added ModifierSelectionDialog JSX')
        else:
            print('[WARN] Could not find BillPreviewModal anchor for dialog JSX')

    if code != orig:
        with open(f, 'w') as fh:
            fh.write(code)
        print(f'[DONE] pos.tsx patched successfully')
    else:
        print('[SKIP] pos.tsx no changes needed')

def patch_kds():
    f = 'client/src/pages/dashboards/kitchen-board.tsx'
    with open(f, 'r') as fh:
        code = fh.read()
    orig = code

    # Add modifier display after first item.name in KDS
    if 'modifier-group-kds' not in code:
        # Find the main item name display pattern
        anchor = '<span className="font-semibold text-sm">{item.name}</span>'
        if anchor in code:
            mod_display = '''</span>
                    {item.modifiers && Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                      <div className="mt-0.5 space-y-0.5" data-testid="modifier-group-kds">
                        {(item.modifiers as any[]).map((mod: any, idx: number) => (
                          <div key={idx} className="text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                            {"\u2192"} {mod.optionName || mod.label}
                          </div>
                        ))}
                      </div>
                    )}'''
            code = code.replace(anchor, anchor.replace('</span>', '') + mod_display, 1)
            print('[OK] Added modifier display to KDS')
        else:
            print('[WARN] Could not find KDS item.name anchor')

    if code != orig:
        with open(f, 'w') as fh:
            fh.write(code)
        print(f'[DONE] kitchen-board.tsx patched')
    else:
        print('[SKIP] kitchen-board.tsx no changes needed')

if __name__ == '__main__':
    print('=== Patching POS for Modifier Groups ===')
    patch_pos()
    print()
    print('=== Patching KDS for Modifier Display ===')
    patch_kds()
    print()
    print('All patches complete. Run: npm run build 2>&1 | tail -20')
