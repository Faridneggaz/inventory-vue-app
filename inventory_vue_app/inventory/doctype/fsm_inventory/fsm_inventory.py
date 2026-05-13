# Copyright (c) 2026, ERPNext Dev and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import getdate, get_time

class FSMInventory(Document):
    def on_submit(self):
        # 1. first of all ::: =>> Get the company from the Warehouse record
        if not self.warehouse:
            frappe.throw("Warehouse is required to generate Stock Reconciliation.")
            
        company = frappe.get_value("Warehouse", self.warehouse, "company")
        
        if not company:
            frappe.throw(f"Could not find a Company linked to Warehouse {self.warehouse}")

        # 2. now :  Initialize the Stock Reconciliation
        stock_reco = frappe.new_doc("Stock Reconciliation")
        stock_reco.purpose = "Stock Reconciliation"
        stock_reco.company = company
        
        # for sure ::: Handling the DATETIME split
        if self.end_date:
            stock_reco.posting_date = getdate(self.end_date)
            stock_reco.posting_time = get_time(self.end_date)
        else:
            stock_reco.posting_date = frappe.utils.nowdate()
            stock_reco.posting_time = frappe.utils.nowtime()
            
        stock_reco.set_posting_time = 1
        
        # 3. then ::: Add items to the Stock Reconciliation child table
        items_added = 0
        for item in self.fsm_inventory_item:
            # Include items that have been counted
            stock_reco.append("items", {
                "item_code": item.item_code,
                "warehouse": self.warehouse,
                "qty": item.counted_qty,
                "valuation_rate": item.buying_price or 0,
            })
            items_added += 1
                

        if items_added > 0:
            # 4. Save as Draft
            stock_reco.insert()
            
            # 5. Link the created Stock Reconciliation back to this document
            self.db_set("stock_reconciliation", stock_reco.name)
            
            frappe.msgprint(f"Draft Stock Reconciliation <b>{stock_reco.name}</b> has been created using the recorded buying prices.")
        else:
            frappe.msgprint("No items with a counted quantity were found; Stock Reconciliation skipped.")