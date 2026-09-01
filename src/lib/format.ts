export const peso = (value: number | null | undefined) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value ?? 0);

export const shortDate = (value: string) => {
  const date = new Date(value);
  return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
};

export const dayKey = (value: string) => new Date(value).toISOString().slice(0, 10);
