import fs from 'fs';

const menuFile = 'client/src/pages/modules/menu.tsx';
let c = fs.readFileSync(menuFile, 'utf8');
let ch = 0;

// Fix C4: Add modifier queries before allRecipes
const a4 = 'const { data: allRecipes = [] } = useQuery<RecipeWithIngredients[]>';
if (c.includes(a4) && !c.includes('allModifierGroups')) {
  const modQueries = [
    'const { data: allModifierGroups = [] } = useQuery({',
    '    queryKey: ["/api/modifier-groups"],',
    '    queryFn: async () => {',
    '      const res = await fetch("/api/modifier-groups", { credentials: "include" });',
    '      if (!res.ok) throw new Error("Failed to fetch modifier groups");',
    '      return res.json();',
    '    },',
    '  });',
    '',
    '  const { data: itemModifierGroups = [], refetch: refetchItemModifiers } = useQuery({',
    '    queryKey: ["/api/menu-items", editingItem?.id, "modifier-groups"],',
    '    queryFn: async () => {',
    '      if (!editingItem?.id) return [];',
    '      const res = await fetch(`/api/menu-items/${editingItem.id}/modifier-groups`, { credentials: "include" });',
    '      if (!res.ok) return [];',
    '      return res.json();',
    '    },',
    '    enabled: !!editingItem?.id,',
    '  });',
    '',
    '  useEffect(() => {',
    '    if (Array.isArray(itemModifierGroups)) {',
    '      setSelectedModifierIds((itemModifierGroups as any[]).map((g: any) => g.id));',
    '    }',
    '  }, [itemModifierGroups, editingItem?.id]);',
    '',
    '  ',
  ].join('\n');
  c = c.replace(a4, modQueries + a4);
  ch++;
  console.log('[OK] C4: modifier queries added before allRecipes');
} else {
  console.log('[SKIP] C4: anchor not found or already applied');
}

// Fix C7: Add Modifiers TabsTrigger after Recipe trigger
const a7 = 'Food Cost</TabsTrigger>}';
if (c.includes(a7) && !c.includes('value="modifiers"')) {
  const modTrigger = [
    'Food Cost</TabsTrigger>}',
    '          {editingItem && (',
    '            <TabsTrigger value="modifiers" data-testid="tab-modifiers">',
    '              Modifiers',
    '              {selectedModifierIds.length > 0 && (',
    '                <Badge variant="secondary" className="ml-2 text-xs">{selectedModifierIds.length}</Badge>',
    '              )}',
    '            </TabsTrigger>',
    '          )}',
  ].join('\n');
  c = c.replace(a7, modTrigger);
  ch++;
  console.log('[OK] C7: Modifiers TabsTrigger added');
} else {
  console.log('[SKIP] C7: anchor not found or already applied');
}

fs.writeFileSync(menuFile, c);
console.log('\nFixed ' + ch + ' items in menu.tsx');
