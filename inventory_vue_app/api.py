import frappe

@frappe.whitelist()
def get_items_with_details(item_group=None, warehouse=None, buying_price_list=None, selling_price_list=None):
    query = """
        SELECT 
            item.name as item_code,
            item.item_name as item_name,
            (SELECT barcode FROM `tabItem Barcode` WHERE parent = item.name LIMIT 1) as barcode,
            IFNULL(bin.actual_qty, 0) as qty,
            IFNULL(bp.price_list_rate, 0) as buying_rate,
            IFNULL(sp.price_list_rate, 0) as selling_rate
        FROM 
            `tabItem` item
        LEFT JOIN 
            `tabBin` bin ON bin.item_code = item.name AND bin.warehouse = %(warehouse)s
        LEFT JOIN 
            `tabItem Price` bp ON bp.item_code = item.name AND bp.price_list = %(buying_list)s
        LEFT JOIN 
            `tabItem Price` sp ON sp.item_code = item.name AND sp.price_list = %(selling_list)s
        WHERE 
            item.disabled = 0
    """
    
    values = {
        "warehouse": warehouse,
        "buying_list": buying_price_list,
        "selling_list": selling_price_list
    }

    if item_group:
        query += " AND item.item_group = %(item_group)s"
        values["item_group"] = item_group

    return frappe.db.sql(query, values, as_dict=True)