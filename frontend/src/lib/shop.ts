const SHOP_NAME_KEY = 'shop_name';

export function getStoredShopName(): string {
  const value = localStorage.getItem(SHOP_NAME_KEY) ?? '';
  return value.trim();
}

export function getShopNameOrDefault(): string {
  return getStoredShopName() || 'GestionStore';
}

export function saveShopName(value: string): string {
  const trimmed = value.trim();
  if (trimmed) {
    localStorage.setItem(SHOP_NAME_KEY, trimmed);
    return trimmed;
  }
  localStorage.removeItem(SHOP_NAME_KEY);
  return '';
}

