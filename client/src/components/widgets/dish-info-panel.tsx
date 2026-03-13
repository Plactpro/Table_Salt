import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  Flame,
  Leaf,
  Wheat,
  Info,
  Utensils,
} from "lucide-react";

interface Ingredient {
  name: string;
  allergen?: boolean;
  allergenType?: string;
}

interface DishIngredients {
  items?: Ingredient[];
  allergens?: string[];
  nutritionalNotes?: string;
  preparationNotes?: string;
  calories?: number;
}

interface DishInfoPanelProps {
  name: string;
  description?: string | null;
  price: string | number;
  image?: string | null;
  isVeg?: boolean | null;
  spicyLevel?: number | null;
  tags?: string[] | null;
  ingredients?: DishIngredients | null;
  compact?: boolean;
}

const spicyLabels = ["Mild", "Medium", "Hot", "Extra Hot", "Extreme"];

export function DishInfoPanel({
  name,
  description,
  price,
  image,
  isVeg,
  spicyLevel,
  tags,
  ingredients,
  compact = false,
}: DishInfoPanelProps) {
  const parsedIngredients: DishIngredients | null =
    ingredients && typeof ingredients === "object" ? ingredients : null;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"} data-testid="dish-info-panel">
      {image && (
        <div className="rounded-lg overflow-hidden bg-muted" data-testid="dish-image-container">
          <img
            src={image}
            alt={name}
            className="w-full h-40 object-cover"
            data-testid="img-dish"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <h4 className="font-semibold text-sm" data-testid="text-dish-name">{name}</h4>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-dish-description">
              {description}
            </p>
          )}
        </div>
        <span className="font-semibold text-sm shrink-0" data-testid="text-dish-price">
          ${Number(price).toFixed(2)}
        </span>
      </div>

      {(isVeg !== null || (spicyLevel && spicyLevel > 0)) && (
        <div className="flex items-center gap-2 flex-wrap">
          {isVeg && (
            <Badge variant="outline" className="border-green-500 text-green-600 text-xs" data-testid="badge-dish-veg">
              <Leaf className="h-3 w-3 mr-1" />
              Vegetarian
            </Badge>
          )}
          {spicyLevel && spicyLevel > 0 && (
            <Badge variant="outline" className="border-orange-500 text-orange-600 text-xs" data-testid="badge-dish-spicy">
              <Flame className="h-3 w-3 mr-1" />
              {spicyLabels[Math.min(spicyLevel - 1, 4)]}
            </Badge>
          )}
        </div>
      )}

      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-1" data-testid="dish-tags">
          {tags.map((tag, i) => (
            <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0.5" data-testid={`badge-tag-${i}`}>
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {parsedIngredients && (
        <>
          <Separator />

          {parsedIngredients.items && parsedIngredients.items.length > 0 && (
            <div data-testid="dish-ingredients-list">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Utensils className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ingredients</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {parsedIngredients.items.map((ing, i) => (
                  <Badge
                    key={i}
                    variant={ing.allergen ? "destructive" : "outline"}
                    className="text-[10px] px-1.5 py-0.5"
                    data-testid={`badge-ingredient-${i}`}
                  >
                    {ing.allergen && <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />}
                    {ing.name}
                    {ing.allergenType && ` (${ing.allergenType})`}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {parsedIngredients.allergens && parsedIngredients.allergens.length > 0 && (
            <div data-testid="dish-allergens">
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-medium text-amber-600 uppercase tracking-wider">Allergens</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {parsedIngredients.allergens.map((a, i) => (
                  <Badge key={i} className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5" data-testid={`badge-allergen-${i}`}>
                    {a}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {parsedIngredients.calories && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="text-dish-calories">
              <Wheat className="h-3.5 w-3.5" />
              <span>{parsedIngredients.calories} cal</span>
            </div>
          )}

          {parsedIngredients.nutritionalNotes && (
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground" data-testid="text-dish-nutrition">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{parsedIngredients.nutritionalNotes}</span>
            </div>
          )}

          {parsedIngredients.preparationNotes && (
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground" data-testid="text-dish-preparation">
              <Utensils className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{parsedIngredients.preparationNotes}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
