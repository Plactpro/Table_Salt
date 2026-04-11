import fs from 'fs';

// === PART 1: Fix server endpoint paths ===
const modFile = 'server/routers/modifiers.ts';
let mod = fs.readFileSync(modFile, 'utf8');
const modOrig = mod;
mod = mod.replaceAll('"/api/menu-items/:id/modifiers"', '"/api/menu-items/:id/modifier-groups"');
if (mod !== modOrig) {
  fs.writeFileSync(modFile, mod);
  console.log('[OK] Fixed modifiers.ts endpoint paths to /modifier-groups');
} else {
  console.log('[SKIP] modifiers.ts already uses /modifier-groups');
}

// === PART 2: Patch menu.tsx ===
const menuFile = 'client/src/pages/modules/menu.tsx';
let c = fs.readFileSync(menuFile, 'utf8');
let changes = 0;

// C1: Add useEffect
if (c.includes('import { useState, useCallback, useMemo } from "react";') && !c.includes('useEffect')) {
  c = c.replace(
    'import { useState, useCallback, useMemo } from "react";',
    'import { useState, useCallback, useMemo, useEffect } from "react";'
  );
  console.log('[OK] C1: useEffect added');
  changes++;
} else { console.log('[SKIP] C1'); }

// C2: Add Checkbox import
if (c.includes('import { Badge } from "@/components/ui/badge";') && !c.includes('Checkbox')) {
  c = c.replace(
    'import { Badge } from "@/components/ui/badge";',
    'import { Badge } from "@/components/ui/badge";\nimport { Checkbox } from "@/components/ui/checkbox";'
  );
  console.log('[OK] C2: Checkbox import added');
  changes++;
} else { console.log('[SKIP] C2'); }

// C3: Add modifier state variables
const stateAnchor = 'const [itemFormErrors, setItemFormErrors] = useState<{ name?: string; price?: string }>({});';
if (c.includes(stateAnchor) && !c.includes('selectedModifierIds')) {
  c = c.replace(stateAnchor, stateAnchor + '\n  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([]);\n  const [savingModifiers, setSavingModifiers] = useState(false);');
  console.log('[OK] C3: modifier state variables added');
  changes++;
} else { console.log('[SKIP] C3'); }

// C4: Add modifier queries before allRecipes
const recipesAnchor = 'const { data: allRecipes = [] } = useQuery({';
if (c.includes(recipesAnchor) && !c.includes('allModifierGroups')) {
  const modQueries = `const { data: allModifierGroups = [] } = useQuery({
    queryKey: ["/api/modifier-groups"],
    queryFn: async () => {
      const res = await fetch("/api/modifier-groups", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: itemModifierGroups = [], refetch: refetchItemModifiers } = useQuery({
    queryKey: ["/api/menu-items", editingItem?.id, "modifier-groups"],
    queryFn: async () => {
      if (!editingItem?.id) return [];
      const res = await fetch(\`/api/menu-items/\${editingItem.id}/modifier-groups\`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!editingItem?.id,
  });

  useEffect(() => {
    if (Array.isArray(itemModifierGroups)) {
      setSelectedModifierIds((itemModifierGroups as any[]).map((g: any) => g.id));
    }
  }, [itemModifierGroups, editingItem?.id]);

  ` + recipesAnchor;
  c = c.replace(recipesAnchor, modQueries);
  console.log('[OK] C4: modifier queries added');
  changes++;
} else { console.log('[SKIP] C4'); }

// C5: Add handleSaveModifiers before toggleTag
const toggleAnchor = 'function toggleTag(tag: string) {';
if (c.includes(toggleAnchor) && !c.includes('handleSaveModifiers')) {
  const saveFn = `const handleSaveModifiers = async () => {
    if (!editingItem?.id) return;
    setSavingModifiers(true);
    try {
      const csrfMatch = document.cookie.match(/(?:^|;\\s*)csrf-token=([^;]*)/);
      const csrfHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (csrfMatch) { csrfHeaders["x-csrf-token"] = decodeURIComponent(csrfMatch[1]); }
      const res = await fetch(\`/api/menu-items/\${editingItem.id}/modifier-groups\`, {
        method: "POST",
        headers: csrfHeaders,
        credentials: "include",
        body: JSON.stringify({ groupIds: selectedModifierIds }),
      });
      if (res.ok) {
        toast({ title: "Modifiers saved", description: \`\${selectedModifierIds.length} modifier group\${selectedModifierIds.length !== 1 ? "s" : ""} assigned\` });
        refetchItemModifiers();
      } else {
        toast({ title: "Failed to save modifiers", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error saving modifiers", variant: "destructive" });
    } finally {
      setSavingModifiers(false);
    }
  };

  ` + toggleAnchor;
  c = c.replace(toggleAnchor, saveFn);
  console.log('[OK] C5: handleSaveModifiers added');
  changes++;
} else { console.log('[SKIP] C5'); }

// C6: Reset selectedModifierIds in openEditItem
const editPattern = /setEditingItem\(item\);\s*\n\s*setItemDialogTab\("details"\)/;
const editMatch = editPattern.exec(c);
if (editMatch && !c.includes('setSelectedModifierIds([])')) {
  c = c.replace(editMatch[0], editMatch[0] + '\n    setSelectedModifierIds([]);');
  console.log('[OK] C6: selectedModifierIds reset added');
  changes++;
} else { console.log('[SKIP] C6'); }

// C7: Add Modifiers TabsTrigger after Recipe trigger
const recipeTrigger = '{editingItem && <TabsTrigger value="recipe">Recipe & Food Cost</TabsTrigger>}';
if (c.includes(recipeTrigger) && !c.includes('value="modifiers"')) {
  c = c.replace(recipeTrigger, recipeTrigger + `\n          {editingItem && (
            <TabsTrigger value="modifiers" data-testid="tab-modifiers">
              Modifiers
              {selectedModifierIds.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">{selectedModifierIds.length}</Badge>
              )}
            </TabsTrigger>
          )}`);
  console.log('[OK] C7: Modifiers TabsTrigger added');
  changes++;
} else { console.log('[SKIP] C7'); }

// C8a: Add Modifiers TabsContent before DialogFooter
if (!c.includes('TabsContent value="modifiers"')) {
  const footerIdx = c.lastIndexOf('<DialogFooter');
  const tabsEnd = c.lastIndexOf('</TabsContent>', footerIdx);
  if (tabsEnd !== -1) {
    const insertPos = tabsEnd + '</TabsContent>'.length;
    const modContent = `\n\n          {editingItem && (
            <TabsContent value="modifiers" className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Select modifier groups for{" "}
                <span className="font-medium">{editingItem?.name}</span>.
                These appear as options in POS when ordering.
              </p>
              {(allModifierGroups as any[]).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No modifier groups found.</div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {(allModifierGroups as any[]).map((group: any) => (
                    <div key={group.id} className={\`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors \${selectedModifierIds.includes(group.id) ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}\`}
                      onClick={() => { setSelectedModifierIds(prev => prev.includes(group.id) ? prev.filter(id => id !== group.id) : [...prev, group.id]); }}>
                      <Checkbox checked={selectedModifierIds.includes(group.id)}
                        onCheckedChange={(checked) => { setSelectedModifierIds(prev => checked ? [...prev, group.id] : prev.filter(id => id !== group.id)); }}
                        onClick={e => e.stopPropagation()} className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{group.name}</span>
                          <Badge variant="outline" className="text-xs">{group.selectionType === "single" ? "Single" : "Multi"}</Badge>
                          {group.isRequired && <Badge variant="destructive" className="text-xs">Required</Badge>}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(group.options ?? []).slice(0, 4).map((opt: any, idx: number) => (
                            <span key={opt.id} className="text-xs text-muted-foreground">
                              {opt.name}{opt.priceAdjustment > 0 ? \` +\${opt.priceAdjustment}\` : ""}{idx < Math.min(3, (group.options ?? []).length - 1) ? "," : ""}
                            </span>
                          ))}
                          {(group.options ?? []).length > 4 && <span className="text-xs text-muted-foreground">+{(group.options ?? []).length - 4} more</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          )}`;
    c = c.slice(0, insertPos) + modContent + c.slice(insertPos);
    console.log('[OK] C8a: Modifiers TabsContent added');
    changes++;
  } else { console.log('[WARN] C8a: insertion point not found'); }
} else { console.log('[SKIP] C8a'); }

// C8b: Add Save Modifiers button to DialogFooter
const cancelBtn = 'data-testid="button-cancel-item"';
if (c.includes(cancelBtn) && !c.includes('Save Modifiers')) {
  const saveBtn = `data-testid="button-save-modifiers-footer" onClick={handleSaveModifiers} disabled={savingModifiers}>
              {savingModifiers ? "Saving..." : "Save Modifiers"}
            </Button>
          )}
          {itemDialogTab !== "modifiers" && (
            <Button data-testid="button-cancel-item"`;
  c = c.replace(cancelBtn, saveBtn);
  console.log('[OK] C8b: Save Modifiers button added');
  changes++;
} else { console.log('[SKIP] C8b'); }

fs.writeFileSync(menuFile, c);
console.log(`\n[DONE] menu.tsx patched with ${changes} changes`);

console.log('\nNow run: node patch_pos.mjs');
console.log('Then: npm run build 2>&1 | tail -20');
