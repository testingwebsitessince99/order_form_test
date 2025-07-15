const SHEET_ID = '1t4tmobO8LfPjHKEot_nfpszi52pcJpqtWwmsR7bbpa8';  // Replace with your real Sheet ID

function doGet(e) {
  const view = e.parameter.view || 'form'; // Default view
  const file = view === 'admin' ? 'admin' : 'form';

  return HtmlService.createHtmlOutputFromFile(file)
    .setTitle(view === 'admin' ? 'Admin Dashboard' : 'Order Form');
}

function getProducts() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Product List');
  const rows = sheet.getDataRange().getValues().slice(1); // Skip header
  const categories = {};

  rows.forEach(([category, name]) => {
    if (!categories[category]) categories[category] = [];
    categories[category].push(name);
  });

  return categories;
}

function submitOrder(data) {
  try {
    const ss = SpreadsheetApp.openById("1t4tmobO8LfPjHKEot_nfpszi52pcJpqtWwmsR7bbpa8");  // <-- Update this line
    const rawSheet = ss.getSheetByName("Raw Submissions");
    const timestamp = new Date();

    rawSheet.appendRow([
      timestamp,
      data.customerName,
      data.deliveryDate,
      JSON.stringify(data.quantities)
    ]);

    updateOrdersSheet();

    return true;
  } catch (err) {
    Logger.log("Error in submitOrder: " + err);
    throw new Error("Something went wrong while saving your order.");
  }
}

function updateOrdersSheet() {
  const ss = SpreadsheetApp.openById("1t4tmobO8LfPjHKEot_nfpszi52pcJpqtWwmsR7bbpa8");
  const rawSheet = ss.getSheetByName("Raw Submissions");
  let ordersSheet = ss.getSheetByName("Orders");

  if (!ordersSheet) {
    ordersSheet = ss.insertSheet("Orders");
  } else {
    ordersSheet.clear();
  }

  const rawData = rawSheet.getDataRange().getValues();
  if (rawData.length <= 1) return;

  const rows = rawData.slice(1);

  const grouped = {};
  rows.forEach(row => {
    const [timestamp, name, deliveryDate, qtyJson] = row;
    const date = new Date(deliveryDate).toDateString();

    let parsedQty = {};
    try {
      parsedQty = JSON.parse(qtyJson);
    } catch (e) {
      Logger.log(`Failed to parse quantities: ${qtyJson}`);
    }

    if (!grouped[date]) grouped[date] = [];
    grouped[date].push({ name, qty: parsedQty });
  });

  const output = [];
  for (const date in grouped) {
    output.push([date]); // Row 1: delivery date
    const productsSet = new Set();

    grouped[date].forEach(order => {
      Object.keys(order.qty).forEach(product => productsSet.add(product));
    });

    const productList = Array.from(productsSet).sort();
    const headerRow = ["Customer Name", ...productList];
    output.push(headerRow);

    grouped[date].forEach(order => {
      const row = [order.name];
      productList.forEach(product => {
        row.push(order.qty[product] || "");
      });
      output.push(row);
    });

    output.push(new Array(headerRow.length).fill("")); // Spacer row
  }

  // Final validation to prevent inconsistent rows
  const maxCols = Math.max(...output.map(row => row.length));
  const paddedOutput = output.map(row => {
    const newRow = row.slice();
    while (newRow.length < maxCols) {
      newRow.push("");
    }
    return newRow;
  });

  ordersSheet.getRange(1, 1, paddedOutput.length, maxCols).setValues(paddedOutput);
}

function rebuildOrdersFromRaw() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const ordersSheet = ss.getSheetByName('Orders');
  const rawSheet = ss.getSheetByName('Raw Submissions');
  const productList = getFlatProductList();

  // Clear Orders sheet
  ordersSheet.clearContents();

  const rawData = rawSheet.getDataRange().getValues().slice(1); // Skip header
  const groupedByDate = {};

  rawData.forEach(row => {
    const customerName = row[1];
    const deliveryDate = row[2];
    const quantities = JSON.parse(row[3]);

    if (!groupedByDate[deliveryDate]) groupedByDate[deliveryDate] = [];
    groupedByDate[deliveryDate].push({
      customerName,
      quantities
    });
  });

  // Sort dates chronologically
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(a) - new Date(b));
  let currentRow = 1;

  sortedDates.forEach(date => {
    const orders = groupedByDate[date];

    // Header row for date
    const headerRow = [`Delivery Date: ${date}`, ...productList];
    ordersSheet.getRange(currentRow++, 1, 1, headerRow.length).setValues([headerRow]);

    // Add customer rows
    orders.forEach(order => {
      const row = [order.customerName];
      productList.forEach(prod => {
        row.push(order.quantities[prod] || '');
      });
      ordersSheet.getRange(currentRow++, 1, 1, row.length).setValues([row]);
    });

    // Empty row between groups
    currentRow++;
  });
}

function searchOrders(filters) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Raw Submissions');
  const productList = getFlatProductList();
  const data = sheet.getDataRange().getValues().slice(1); // skip header
  const results = [];

  data.forEach(row => {
    const customerName = row[1];
    const deliveryDate = row[2];
    const quantities = JSON.parse(row[3]);

    const matchCustomer = filters.customer ? customerName.toLowerCase().includes(filters.customer) : true;
    const matchDate = filters.date ? filters.date === deliveryDate : true;

    if (matchCustomer && matchDate) {
      const entry = {
        'Customer Name': customerName,
        'Delivery Date': deliveryDate,
      };

      productList.forEach(prod => {
        entry[prod] = quantities[prod] || '';
      });

      results.push(entry);
    }
  });

  return results;
}

