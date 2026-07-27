const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' })

export function formatAmount(amount: number): string {
  return currency.format(amount)
}
