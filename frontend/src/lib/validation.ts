import { z } from 'zod';

export const productSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  barcode: z.string().optional(),
  categoryId: z.string().min(1, 'Sélectionnez une catégorie'),
  buyPrice: z.number().min(0, "Le prix d'achat ne peut pas être négatif").optional(),
  sellPrice: z.number().min(0, 'Le prix de vente ne peut pas être négatif'),
  quantity: z.number().int('La quantité doit être un entier').min(0, 'La quantité ne peut pas être négative'),
  alertThreshold: z.number().int().min(0, "Le seuil d'alerte ne peut pas être négatif"),
  usage: z.enum(['vente', 'achat', 'achat_vente']).optional(),
});

export const categorySchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
});

export const customerSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  phone: z.string().min(8, 'Le numéro de téléphone est invalide'),
});

export const supplierSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  phone: z.string().min(8, 'Le numéro de téléphone est invalide'),
  address: z.string().optional(),
});

export const userSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
  role: z.enum(['gerant', 'vendeur']),
});

export const expenseSchema = z.object({
  category: z.string().min(1, 'Sélectionnez une catégorie'),
  amount: z.number().positive('Le montant doit être supérieur à 0'),
  description: z.string().min(3, 'La description doit contenir au moins 3 caractères'),
  date: z.string().min(1, 'La date est requise'),
  recurring: z.boolean(),
});

export const stockMovementSchema = z.object({
  productId: z.string().min(1, 'Sélectionnez un produit'),
  // Entrée/sortie sont créées automatiquement par les ventes/réceptions.
  type: z.enum(['ajustement', 'retour']),
  quantity: z.number().int().positive('La quantité doit être supérieure à 0'),
  reason: z.string().min(3, 'La raison doit contenir au moins 3 caractères'),
});

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.');
    if (!errors[key]) errors[key] = issue.message;
  }
  return { success: false, errors };
}
