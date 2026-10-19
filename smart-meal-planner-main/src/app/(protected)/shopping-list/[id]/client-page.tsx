"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Trash2, Edit2, Loader2, X, Check, ShoppingCart, Plus, Tag, Banknote, ChevronDown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "~/components/ui/card";
import { cn } from "~/lib/utils";

import { type RouterOutputs } from "~/trpc/react";

type ShoppingListItemType = RouterOutputs["shoppingList"]["getList"]["items"][number];

const PREDEFINED_UNITS = ["unit", "g", "kg", "kgs", "pcs", "ml", "l", "tbsp", "tsp", "cup"];

function EditableShoppingListName({ listId, initialName }: { listId: string; initialName: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setName(initialName);
    }
  }, [initialName, isEditing]);
  
  const utils = api.useUtils();
  const updateName = api.shoppingList.updateName.useMutation({
    onMutate: async (newInfo) => {
      // Cancel any outgoing refetches so they don't overwrite optimistic update
      await utils.shoppingList.getList.cancel({ id: listId });
      // Snapshot the previous value
      const previousList = utils.shoppingList.getList.getData({ id: listId });
      // Optimistically update to the new value
      if (previousList) {
        utils.shoppingList.getList.setData({ id: listId }, {
          ...previousList,
          name: newInfo.name,
        });
      }
      return { previousList };
    },
    onSuccess: () => {
      setIsEditing(false);
    },
    onError: (err, newInfo, context) => {
      // If mutation fails, restore previous data
      if (context?.previousList) {
        utils.shoppingList.getList.setData({ id: listId }, context.previousList);
      }
      setIsEditing(false);
      setName(context?.previousList?.name ?? initialName);
      setErrorToast(err.message || "Failed to update list name. Please try again.");
    },
    onSettled: () => {
      void utils.shoppingList.getList.invalidate({ id: listId });
    }
  });

  // clear toast
  useEffect(() => {
    if (errorToast) {
      const timer = setTimeout(() => setErrorToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [errorToast]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === initialName || trimmed.length > 100) {
      setIsEditing(false);
      setName(initialName);
      return;
    }
    updateName.mutate({ id: listId, name: trimmed });
  };

  const charsLeft = 100 - name.length;
  const isInvalid = name.trim().length === 0 || name.length > 100;
  const isUnchanged = name.trim() === initialName;

  return (
    <div className="mb-6">
      {errorToast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-destructive text-destructive-foreground px-4 py-2 rounded-full shadow-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-5">
          {errorToast}
        </div>
      )}
      
      {isEditing ? (
        <div className="flex flex-col gap-2 relative z-10 w-full max-w-lg">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isInvalid && !isUnchanged) handleSave();
                if (e.key === "Escape") {
                  setIsEditing(false);
                  setName(initialName);
                }
              }}
              disabled={updateName.isPending}
              className="text-2xl md:text-3xl font-bold h-12 py-1 px-3 border-primary/50 shadow-sm"
              maxLength={100}
            />
            <Button
              variant="default"
              size="icon"
              className="h-12 w-12 shrink-0 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
              onClick={handleSave}
              disabled={updateName.isPending || isInvalid || isUnchanged}
            >
              {updateName.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 shrink-0 rounded-xl shadow-sm"
              onClick={() => {
                setIsEditing(false);
                setName(initialName);
              }}
              disabled={updateName.isPending}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <p className={`text-xs pl-2 ${charsLeft < 10 ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
            {name.length}/100 characters
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1 w-full relative group">
          <div className="flex items-center gap-3 w-fit">
            <h1 
              className="text-3xl md:text-4xl font-bold tracking-tight cursor-text transition-colors hover:text-primary"
              onDoubleClick={() => setIsEditing(true)}
              title="Double click to edit"
            >
              {initialName || "Unnamed Plan"}
            </h1>
            <Button
              variant="ghost"
              size="icon"
              className="opacity-0 group-hover:opacity-100 transition-opacity h-9 w-9 text-muted-foreground hover:bg-primary/10 hover:text-primary rounded-xl"
              onClick={() => setIsEditing(true)}
              aria-label="Edit list name"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ShoppingListItemRow({ item, listId }: { item: ShoppingListItemType; listId: string }) {
  const utils = api.useUtils();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.ingredientName);
  const [editQty, setEditQty] = useState(String(item.quantity));
  const [editUnit, setEditUnit] = useState(item.unit);

  const unitOptions = useMemo(() => {
    const opts = [...PREDEFINED_UNITS];
    if (item.unit && !opts.includes(item.unit)) {
      opts.push(item.unit);
    }
    return opts;
  }, [item.unit]);

  const toggleItem = api.shoppingList.toggleChecked.useMutation({
    onSuccess: () => {
      void utils.shoppingList.getList.invalidate({ id: listId });
    }
  });

  const updateItem = api.shoppingList.updateItem.useMutation({
    onSuccess: () => {
      setIsEditing(false);
      void utils.shoppingList.getList.invalidate({ id: listId });
    }
  });

  const deleteItem = api.shoppingList.deleteItem.useMutation({
    onSuccess: () => {
      void utils.shoppingList.getList.invalidate({ id: listId });
    }
  });

  if (isEditing) {
    return (
      <li className="flex items-center gap-3 border-b border-border/40 py-3 last:border-0">
        <Input autoFocus value={editName} onChange={e => setEditName(e.target.value)} className="flex-1 h-9 text-sm" placeholder="Ingredient name" />
        <Input type="number" step="0.1" value={editQty} onChange={e => setEditQty(e.target.value)} className="w-20 h-9 text-sm text-center" placeholder="Qty" />
        <select
          value={editUnit}
          onChange={e => setEditUnit(e.target.value)}
          className="flex h-9 w-24 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {unitOptions.map(u => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 ml-2">
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-9 w-9" 
            disabled={updateItem.isPending || !editName.trim() || Number(editQty) <= 0 || !editUnit.trim()}
            onClick={() => updateItem.mutate({ itemId: item.id, ingredientName: editName.trim(), quantity: Number(editQty), unit: editUnit.trim() })}
          >
            {updateItem.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:bg-muted h-9 w-9" onClick={() => setIsEditing(false)} disabled={updateItem.isPending}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className={cn(
      "flex items-center gap-4 py-3.5 border-b border-border/40 last:border-0 transition-colors group",
      item.isChecked && "opacity-60"
    )}>
      <div className="relative flex items-center justify-center">
        <input
          type="checkbox"
          checked={item.isChecked}
          onChange={() => toggleItem.mutate({ itemId: item.id })}
          disabled={toggleItem.isPending || deleteItem.isPending}
          className="peer h-5 w-5 cursor-pointer appearance-none rounded-sm border-2 border-primary/50 bg-background checked:border-primary checked:bg-primary transition-all disabled:opacity-50"
        />
        <Check className="pointer-events-none absolute text-primary-foreground opacity-0 peer-checked:opacity-100 h-3 w-3" strokeWidth={3} />
      </div>
      
      <div className="flex flex-1 flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
        <span className={cn(
          "font-medium text-[15px] transition-all",
          item.isChecked && "line-through text-muted-foreground"
        )}>
          {item.ingredientName}
        </span>
        
        <div className="flex items-center gap-2 flex-wrap mt-0.5 sm:mt-0">
          <span className="text-sm text-muted-foreground">
            {item.quantity} {item.unit}
          </span>
          {typeof item.estimatedPriceEur === 'number' && item.priceUnit && (
            <span className="inline-flex items-center text-[10px] font-semibold text-emerald-700 bg-emerald-100/80 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full whitespace-nowrap">
              ~€{item.estimatedPriceEur.toFixed(2)}/{item.priceUnit}
            </span>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary h-8 w-8" onClick={() => setIsEditing(true)} disabled={toggleItem.isPending || deleteItem.isPending}>
          <Edit2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 w-8" onClick={() => deleteItem.mutate({ itemId: item.id })} disabled={toggleItem.isPending || deleteItem.isPending}>
          {deleteItem.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>
    </li>
  );
}

function AisleCard({ 
  aisle, 
  items, 
  listId 
}: { 
  aisle: string; 
  items: ShoppingListItemType[]; 
  listId: string; 
}) {
  const [isOpen, setIsOpen] = useState(true);
  
  return (
    <Card className="overflow-hidden border-border/50 shadow-sm transition-all hover:shadow-md">
      <CardHeader 
        className="bg-muted/30 px-6 py-4 border-b border-border/40 cursor-pointer select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl capitalize flex items-center gap-2">
            {aisle}
            <span className="text-xs font-normal text-muted-foreground bg-background px-2 py-0.5 rounded-full border">
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </span>
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
            <ChevronDown className={cn("h-5 w-5 transition-transform duration-200", isOpen ? "" : "-rotate-90")} />
          </Button>
        </div>
      </CardHeader>
      <div 
        className={cn(
          "grid transition-all duration-200 ease-in-out",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <CardContent className="p-0">
            <ul className="px-6 flex flex-col">
              {items.map((item) => (
                <ShoppingListItemRow key={item.id} item={item} listId={listId} />
              ))}
            </ul>
          </CardContent>
        </div>
      </div>
    </Card>
  );
}

export default function ShoppingListDetailClient({ listId }: { listId: string }) {
  const { data: list, isLoading } = api.shoppingList.getList.useQuery({ id: listId });
  const utils = api.useUtils();

  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newUnit, setNewUnit] = useState("unit");

  const addItem = api.shoppingList.addItem.useMutation({
    onSuccess: () => {
      setNewName("");
      setNewQty("1");
      setNewUnit("unit");
      void utils.shoppingList.getList.invalidate({ id: listId });
    }
  });

  const listItemsByCategory = useMemo(() => {
    if (!list?.items) return {};
    const grouped: Record<string, typeof list.items> = {};
    for (const item of list.items) {
      const category = item.category ?? "Other";
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(item);
    }
    return grouped;
  }, [list?.items]);

  if (isLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!list) return <div className="text-center mt-20">List not found.</div>;

  const validNewItem = newName.trim() !== "" && newUnit.trim() !== "" && Number(newQty) > 0;

  return (
    <div className="container mx-auto max-w-4xl p-4 pb-24 md:p-8 md:pb-12 space-y-8">
      <div className="flex flex-col gap-4">
        <EditableShoppingListName listId={listId} initialName={list.name ?? "Unnamed Plan"} />
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
          <div className="inline-flex w-fit items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2 font-medium text-emerald-800 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-500/20 shadow-sm">
            <Banknote className="h-4 w-4" />
            <span>Estimated total: €{(list.estimatedTotal ?? 0).toFixed(2)}</span>
          </div>
          <span className="text-xs text-muted-foreground italic flex items-center mt-1 sm:mt-0">
            <Tag className="h-3 w-3 mr-1" />
            prices are estimates based on active plans
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground font-bold tracking-widest uppercase">
        <ShoppingCart className="h-4 w-4" />
        <h2>Organized by Aisle</h2>
        <div className="h-px flex-1 bg-border/60 ml-2"></div>
      </div>

      <div className="space-y-6">
        {/* Group by Aisle */}
        {Object.entries(listItemsByCategory).map(([aisle, items]) => (
          <AisleCard key={aisle} aisle={aisle} items={items} listId={listId} />
        ))}

        {Object.keys(listItemsByCategory).length === 0 && (
          <Card className="border-dashed border-2 bg-muted/10">
            <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mb-4 text-muted" />
              <p className="text-lg font-medium text-foreground">Your list is empty</p>
              <p className="max-w-sm mt-1">Start adding items manually below, or generate a fresh shopping list from a meal plan.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Manual Item Form */}
      <Card className="border-border/50 shadow-sm mt-8 relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary"></div>
        <CardHeader className="px-6 py-4 pb-2">
          <CardTitle className="text-sm font-bold tracking-widest text-muted-foreground uppercase flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            Add Custom Item
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <form 
            className="flex flex-col sm:flex-row gap-3 pt-2"
            onSubmit={e => {
              e.preventDefault();
              if (validNewItem) {
                addItem.mutate({ listId, ingredientName: newName.trim(), quantity: Number(newQty), unit: newUnit.trim() });
              }
            }}
          >
            <Input 
              placeholder="E.g. Coffee beans..." 
              value={newName} 
              onChange={e => setNewName(e.target.value)} 
              className="flex-1 h-11 text-base shadow-sm" 
            />
            <div className="flex gap-3">
              <Input 
                type="number" 
                step="0.1" 
                placeholder="Qty" 
                value={newQty} 
                onChange={e => setNewQty(e.target.value)} 
                className="w-24 h-11 text-base text-center shadow-sm" 
              />
              <select
                value={newUnit}
                onChange={e => setNewUnit(e.target.value)}
                className="flex h-11 w-28 rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {PREDEFINED_UNITS.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <Button 
              disabled={!validNewItem || addItem.isPending} 
              type="submit" 
              className="h-11 px-8 sm:w-auto w-full font-semibold shadow-sm transition-all active:scale-95"
            >
              {addItem.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Add Item"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
