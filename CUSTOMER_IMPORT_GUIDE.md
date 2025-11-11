# Customer CSV Import Guide

## Overview
You can now import multiple customers at once using a CSV (Comma-Separated Values) file. This is useful for bulk importing customer data.

## CSV File Format

### Required Columns
- `name` - Customer name
- `address` - Full address
- `phone` - Phone number
- `price` - Service price

### Optional Columns
- `email` - Email address
- `propertySize` (or `squareFootage`, `sqft`) - Property size in square feet (default: 5000)
- `serviceFrequency` (or `frequency`) - Service frequency: weekly, biweekly, or monthly (default: weekly)
- `notes` - Additional notes
- `lastCutDate` - Last cut date in YYYY-MM-DD format
- `nextCutDate` - Next cut date in YYYY-MM-DD format (auto-calculated if not provided)
- `status` - Customer status: **incomplete**, **complete**, or **inactive** (default: incomplete)

### Sample CSV File

A sample CSV file `test-customers-homewood.csv` is included in the project root with 13 real addresses around Homewood, Alabama.

### CSV Format Example
```csv
name,address,phone,email,notes,propertySize,price,serviceFrequency,lastCutDate,nextCutDate,status
Michael Thompson,425 Woodvale Ln Homewood AL 35209,205-555-0101,michael.t@example.com,Corner lot with oak trees,5800,65,weekly,2025-11-04,2025-11-11,incomplete
Sarah Martinez,418 Woodvale Ln Homewood AL 35209,205-555-0102,sarah.m@example.com,Fenced backyard,4200,55,weekly,2025-11-04,2025-11-11,incomplete
```

## How to Import

1. **Prepare your CSV file** with the required columns
2. **Navigate to Customer Management** in the app
3. **Click the "Import CSV" button** (next to "Add Customer")
4. **Select your CSV file**
5. The system will:
   - Validate the file format
   - Check for required columns
   - Import each customer
   - Auto-calculate next cut dates based on last cut date + frequency
   - Show success/error messages

## Tips

- Make sure dates are in YYYY-MM-DD format (e.g., 2025-11-04)
- Phone numbers can be in any format
- If `nextCutDate` is not provided but `lastCutDate` is, the system will auto-calculate it
- Supported file types: .csv, .xlsx, .xls
- All columns are case-insensitive (Name, NAME, name all work)

## Test Data

The included `test-customers-homewood.csv` file contains:
- 13 customers with real addresses in Homewood, AL
- Addresses near 413 Woodvale Lane, 35209
- Mix of last cut dates (6-7 days ago)
- All set to weekly service frequency
- Property sizes ranging from 4,200 to 8,200 sq ft
- Prices ranging from $55 to $90

## Troubleshooting

### "Missing required columns" error
- Make sure your CSV has: name, address, phone, and price columns
- Check that the first row contains column headers

### "Failed to parse CSV file" error
- Ensure the file is a valid CSV format
- Try opening in Excel/Google Sheets and re-exporting as CSV
- Make sure commas in text fields are properly escaped

### Some customers failed to import
- Check the console for specific error messages
- Verify data types (price should be a number, dates in YYYY-MM-DD format)
- Ensure required fields are not empty
