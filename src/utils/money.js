// Money is saved in paise (whole numbers), never as decimals.
// 100.50 rupees is saved as 10050. Adding whole numbers is always exact,
// while 0.1 + 0.2 in JavaScript gives 0.30000000000000004.

function toPaise(rupees) {
  return Math.round(rupees * 100);
}

function toRupees(paise) {
  return paise / 100;
}

module.exports = { toPaise, toRupees };
