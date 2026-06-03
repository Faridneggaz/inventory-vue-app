console.log('Loading inventory app...');

/**
 * Inventory Management Vue.js Application
 * 
 * Handles real-time inventory tracking, warehouse synchronization, 
 * and item validation with barcode support.
 */
window.start_inventory_app = function() {

    /**
     * Mounts the Vue 3 application to the DOM.
     */
    function mount_vue() {

        Vue.createApp({
            delimiters: ['[[', ']]'],
            data() {
                return {
                    inventories: [],
                    sidebarVisible: true,
                    currentInventory: null,
                    loadingDetail: false,

                    // Master metadata for dropdowns
                    warehouses: [],
                    families: [],
                    priceLists: [],

                    // State management
                    currentPage: 1,
                    itemsPerPage: 50,
                    searchQuery: '',
                    isSelecting: false,
                    autoSaveTimer: null,
                    filtersCollapsed: false
                }
            },

            async mounted() {
                console.log('Vue app mounted and ready');
                await Promise.all([
                    this.loadInventories(),
                    this.loadMasterData()
                ]);
            },

            /**
             * Reactive property watchers.
             */
            watch: {
                'currentInventory.warehouse'(val) {
                    if (val && this.isEditable()) {
                        console.log('Warehouse changed, fetching items...');
                        this.fetchWarehouseItems(this.isSelecting);
                    }
                },

                'currentInventory.group'(val) {
                    if (this.currentInventory?.warehouse && this.isEditable()) {
                        console.log('Item group changed, fetching items...');
                        this.fetchWarehouseItems(this.isSelecting);
                    }
                }
            },

            methods: {
                /**
                 * Populates master data for select inputs.
                 */
                async loadMasterData() {
                    try {
                        const [wh, ig, pl] = await Promise.all([
                            frappe.db.get_list('Warehouse', { fields: ['name'], order_by: 'name asc', limit: 500 }),
                            frappe.db.get_list('Item Group', { fields: ['name'], order_by: 'name asc', limit: 500 }),
                            frappe.db.get_list('Price List', { fields: ['name'], order_by: 'name asc', limit: 100 })
                        ]);

                        this.warehouses = wh || [];
                        this.families = ig || [];
                        this.priceLists = pl || [];
                    } catch (e) {
                        console.error("Échec du chargement des données maîtresses:", e);
                    }
                },

                toggleSidebar() { this.sidebarVisible = !this.sidebarVisible; },

                isCurrent(name) {
                    return this.currentInventory && this.currentInventory.name === name;
                },

                hasSelected() {
                    return this.currentInventory !== null;
                },

                hasLoading() {
                    return this.loadingDetail === true;
                },

                hasNoItems() {
                    return !this.currentInventory || !this.currentInventory.fsm_inventory_item || this.currentInventory.fsm_inventory_item.length === 0;
                },

                /**
                 * Determines if the current document is in an editable state (Draft).
                 */
                isEditable() {
                    return this.currentInventory && (this.currentInventory.docstatus === 0 || !this.currentInventory.name);
                },

                /**
                 * Returns the full list of items. (Search filtering disabled as per user request)
                 */
                getFilteredItems() {
                    if (!this.currentInventory || !this.currentInventory.fsm_inventory_item) return [];
                    return this.currentInventory.fsm_inventory_item;
                },

                /**
                 * Handles barcode scanning or manual item code entry.
                 * Increments Counted Qty if a match is found (case-insensitive).
                 */
                async handleBarcodeScan() {
                    console.log('handleBarcodeScan triggered with input:', this.searchQuery);
                    if (!this.searchQuery) return;

                    const code = this.searchQuery.trim().toLowerCase();
                    const items = this.currentInventory.fsm_inventory_item || [];

					console.log('Searching for item with code:', code);
                    // Find item by code, barcode, or name (case-insensitive match)
                    const item = items.find(i =>
                        (i.item_code || '').toLowerCase() === code ||
                        (i.barcode || '').toLowerCase() === code ||
                        (i.item_name || '').toLowerCase() === code
                    );

                    if (item) {
                        item.counted_qty = (item.counted_qty || 0) + 1;
                        item.qty_offset = Math.abs((item.counted_qty || 0) - (item.expected_qty || 0));
                        item.is_scanned = 1;
                        item.scanned = 1;
                        item.scanned_at = frappe.datetime.now_datetime();

                        frappe.show_alert({
                            message: __('{0}: Compté {1}', [item.item_code, item.counted_qty]),
                            indicator: 'green'
                        });

                        // Clear input for next scan
                        this.searchQuery = '';

                        // Debounced auto-save: clear existing timer and set new one for 3 seconds
                        if (this.isEditable()) {
                            if (this.autoSaveTimer) {
                                clearTimeout(this.autoSaveTimer);
                            }
                            this.autoSaveTimer = setTimeout(() => {
                                this.saveInventory();
                            }, 3000);
                        }
                    } else {
                        frappe.show_alert({
                            message: __('L élément "{0}" est introuvable dans cette liste', [this.searchQuery.trim()]),
                            indicator: 'orange'
                        });
                    }
                },

                clearSearch() {
                    this.searchQuery = '';
                    this.currentPage = 1;
                },

                toggleFilters() {
                    this.filtersCollapsed = !this.filtersCollapsed;
                },

                getFilterIconClass() {
                    return this.filtersCollapsed ? 'fa-chevron-down' : 'fa-chevron-up';
                },

                getFilterButtonText() {
                    return this.filtersCollapsed ? 'Show Filters' : 'Hide Filters';
                },

                /**
                 * Exports inventory items to Excel format with styling.
                 */
                exportItems() {
                    if (!this.currentInventory || !this.currentInventory.fsm_inventory_item) {
                        frappe.msgprint(__('Aucun élément à exporter'));
                        return;
                    }

                    const items = this.currentInventory.fsm_inventory_item;

                    // Load SheetJS library if not available
                    if (!window.XLSX) {
                        const script = document.createElement('script');
                        script.src = 'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js';
                        script.onload = () => this.generateExcel(items);
                        document.head.appendChild(script);
                    } else {
                        this.generateExcel(items);
                    }
                },

                /**
                 * Generates and downloads Excel file with styling.
                 */
                generateExcel(items) {
                    // Create workbook
                    const wb = XLSX.utils.book_new();

                    // Inventory Information Sheet
                    const invData = [
                        ['INVENTORY INFORMATION'],
                        [''],
                        ['Field', 'Value'],
                        ['Name', this.currentInventory.name || ''],
                        ['Reference', this.currentInventory.inventory_reference || ''],
                        ['Warehouse', this.currentInventory.warehouse || ''],
                        ['Family', this.currentInventory.group || ''],
                        ['Starting Date', this.currentInventory.starting_date || ''],
                        ['End Date', this.currentInventory.end_date || ''],
                        ['Buying Price List', this.currentInventory.buying_price_list || ''],
                        ['Selling Price List', this.currentInventory.selling_price_list || ''],
                        ['Total Expected Qty', this.currentInventory.total_expected_qty || 0],
                        ['Total Counted Qty', this.currentInventory.total_counted_qty || 0],
                        ['Total Qty Offset', this.currentInventory.total_qty_offset || 0],
                        ['Status', this.currentInventory.docstatus === 1 ? 'Submitted' : 'Draft']
                    ];

                    const invWs = XLSX.utils.aoa_to_sheet(invData);

                    // Style inventory sheet
                    const invRange = XLSX.utils.decode_range(invWs['!ref']);
                    for (let R = invRange.s.r; R <= invRange.e.r; ++R) {
                        for (let C = invRange.s.c; C <= invRange.e.c; ++C) {
                            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                            if (!invWs[cellAddress]) continue;

                            // Main header row styling
                            if (R === 0) {
                                invWs[cellAddress].s = {
                                    font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
                                    fill: { fgColor: { rgb: '1F4E78' } },
                                    alignment: { horizontal: 'center', vertical: 'center' },
                                    border: {
                                        top: { style: 'thin', color: { rgb: '1F4E78' } },
                                        bottom: { style: 'thin', color: { rgb: '1F4E78' } },
                                        left: { style: 'thin', color: { rgb: '1F4E78' } },
                                        right: { style: 'thin', color: { rgb: '1F4E78' } }
                                    }
                                };
                            }
                            // Column headers styling
                            else if (R === 2) {
                                invWs[cellAddress].s = {
                                    font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } },
                                    fill: { fgColor: { rgb: '4472C4' } },
                                    alignment: { horizontal: 'left', vertical: 'center' },
                                    border: {
                                        top: { style: 'thin', color: { rgb: '4472C4' } },
                                        bottom: { style: 'thin', color: { rgb: '4472C4' } },
                                        left: { style: 'thin', color: { rgb: 'D0D0D0' } },
                                        right: { style: 'thin', color: { rgb: 'D0D0D0' } }
                                    }
                                };
                            }
                            // Field name column styling
                            else if (R >= 3 && C === 0) {
                                invWs[cellAddress].s = {
                                    font: { bold: true, sz: 11, color: { rgb: '1F4E78' } },
                                    fill: { fgColor: { rgb: 'E7E6E6' } },
                                    alignment: { horizontal: 'left', vertical: 'center' },
                                    border: {
                                        top: { style: 'thin', color: { rgb: 'D0D0D0' } },
                                        bottom: { style: 'thin', color: { rgb: 'D0D0D0' } },
                                        left: { style: 'thin', color: { rgb: 'D0D0D0' } },
                                        right: { style: 'thin', color: { rgb: 'D0D0D0' } }
                                    }
                                };
                            }
                            // Value column styling
                            else if (R >= 3 && C === 1) {
                                invWs[cellAddress].s = {
                                    font: { sz: 11, color: { rgb: '000000' } },
                                    fill: { fgColor: { rgb: 'FFFFFF' } },
                                    alignment: { horizontal: 'left', vertical: 'center' },
                                    border: {
                                        top: { style: 'thin', color: { rgb: 'D0D0D0' } },
                                        bottom: { style: 'thin', color: { rgb: 'D0D0D0' } },
                                        left: { style: 'thin', color: { rgb: 'D0D0D0' } },
                                        right: { style: 'thin', color: { rgb: 'D0D0D0' } }
                                    }
                                };
                            }
                        }
                    }

                    // Set column widths
                    invWs['!cols'] = [
                        { wch: 30 }, // Field
                        { wch: 40 }  // Value
                    ];

                    XLSX.utils.book_append_sheet(wb, invWs, 'Inventory Info');

                    // Items Sheet
                    const itemsData = [
                        ['INVENTORY ITEMS'],
                        [''],
                        ['Item Code', 'Item Name', 'Barcode', 'Expected Qty', 'Counted Qty', 'Offset', 'Buying Price', 'Selling Price', 'Scanned', 'Scanned At']
                    ];

                    items.forEach(item => {
                        itemsData.push([
                            item.item_code || '',
                            item.item_name || '',
                            item.barcode || '',
                            item.expected_qty || 0,
                            item.counted_qty || 0,
                            item.qty_offset || 0,
                            item.buying_price || 0,
                            item.selling_price || 0,
                            item.scanned || 0,
                            item.scanned_at || ''
                        ]);
                    });

                    const itemsWs = XLSX.utils.aoa_to_sheet(itemsData);

                    // Style items sheet
                    const itemsRange = XLSX.utils.decode_range(itemsWs['!ref']);
                    for (let R = itemsRange.s.r; R <= itemsRange.e.r; ++R) {
                        for (let C = itemsRange.s.c; C <= itemsRange.e.c; ++C) {
                            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                            if (!itemsWs[cellAddress]) continue;

                            // Main header row styling
                            if (R === 0) {
                                itemsWs[cellAddress].s = {
                                    font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
                                    fill: { fgColor: { rgb: '1F4E78' } },
                                    alignment: { horizontal: 'center', vertical: 'center' },
                                    border: {
                                        top: { style: 'thin', color: { rgb: '1F4E78' } },
                                        bottom: { style: 'thin', color: { rgb: '1F4E78' } },
                                        left: { style: 'thin', color: { rgb: '1F4E78' } },
                                        right: { style: 'thin', color: { rgb: '1F4E78' } }
                                    }
                                };
                            }
                            // Column headers styling
                            else if (R === 2) {
                                itemsWs[cellAddress].s = {
                                    font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
                                    fill: { fgColor: { rgb: '4472C4' } },
                                    alignment: { horizontal: 'center', vertical: 'center' },
                                    border: {
                                        top: { style: 'thin', color: { rgb: '4472C4' } },
                                        bottom: { style: 'thin', color: { rgb: '4472C4' } },
                                        left: { style: 'thin', color: { rgb: 'D0D0D0' } },
                                        right: { style: 'thin', color: { rgb: 'D0D0D0' } }
                                    }
                                };
                            }
                            // Data rows - alternate colors with borders
                            else if (R >= 3) {
                                const isEven = R % 2 === 0;
                                const offsetValue = itemsData[R][5];
                                const hasDiscrepancy = offsetValue !== 0;

                                itemsWs[cellAddress].s = {
                                    font: {
                                        sz: 10,
                                        color: { rgb: hasDiscrepancy && C === 5 ? 'C00000' : '000000' },
                                        bold: hasDiscrepancy && C === 5
                                    },
                                    fill: {
                                        fgColor: {
                                            rgb: hasDiscrepancy && C === 5 ? 'FFC7CE' :
                                                   isEven ? 'FFFFFF' : 'F2F2F2'
                                        }
                                    },
                                    alignment: {
                                        horizontal: [3, 4, 5, 6, 7].includes(C) ? 'right' : 'left',
                                        vertical: 'center'
                                    },
                                    border: {
                                        top: { style: 'thin', color: { rgb: 'D0D0D0' } },
                                        bottom: { style: 'thin', color: { rgb: 'D0D0D0' } },
                                        left: { style: 'thin', color: { rgb: 'D0D0D0' } },
                                        right: { style: 'thin', color: { rgb: 'D0D0D0' } }
                                    }
                                };
                            }
                        }
                    }

                    // Set column widths
                    itemsWs['!cols'] = [
                        { wch: 22 }, // Item Code
                        { wch: 35 }, // Item Name
                        { wch: 18 }, // Barcode
                        { wch: 14 }, // Expected Qty
                        { wch: 14 }, // Counted Qty
                        { wch: 12 }, // Offset
                        { wch: 14 }, // Buying Price
                        { wch: 14 }, // Selling Price
                        { wch: 10 }, // Scanned
                        { wch: 22 }  // Scanned At
                    ];

                    XLSX.utils.book_append_sheet(wb, itemsWs, 'Items');

                    // Generate and download
                    const fileName = `${this.currentInventory.name || 'inventory'}_export_${frappe.datetime.now_date().replace(/-/g, '')}.xlsx`;
                    XLSX.writeFile(wb, fileName);

                    frappe.show_alert({
                        message: __('Exported {0} items to Excel', [items.length]),
                        indicator: 'green'
                    });
                },

                /**
                 * Returns the subset of items for the current page, respecting search filters.
                 */
                getPaginatedItems() {
                    const filtered = this.getFilteredItems();
                    const start = (this.currentPage - 1) * this.itemsPerPage;
                    const end = start + this.itemsPerPage;
                    return filtered.slice(start, end);
                },

                /**
                 * Calculates total pages based on the filtered items list.
                 */
                getTotalPages() {
                    const filtered = this.getFilteredItems();
                    if (filtered.length === 0) return 1;
                    return Math.ceil(filtered.length / this.itemsPerPage);
                },

                nextPage() {
                    if (this.currentPage < this.getTotalPages()) this.currentPage++;
                },

                prevPage() {
                    if (this.currentPage > 1) this.currentPage--;
                },

                /**
                 * Fetches items with stock and price details from the backend.
                 */
                async fetchWarehouseItems(silent = false) {
                    if (!this.currentInventory || !this.currentInventory.warehouse) return;

                    // If items already exist and we are just loading the doc, don't overwrite
                    if (this.currentInventory.fsm_inventory_item && this.currentInventory.fsm_inventory_item.length > 0 && silent) {
                        return;
                    }

                    this.loadingDetail = true;
                    try {
                        const response = await frappe.call({
                            method: 'inventory_vue_app.api.get_items_with_details',
                            args: {
                                warehouse: this.currentInventory.warehouse,
                                item_group: this.currentInventory.group,
                                buying_price_list: this.currentInventory.buying_price_list,
                                selling_price_list: this.currentInventory.selling_price_list
                            }
                        });

                        const items = response.message || [];
                        // Only populate if items were actually returned
                        if (items.length > 0) {
                            this.currentInventory.fsm_inventory_item = items.map(item => ({
                                item_code: item.item_code,
                                item_name: item.item_name,
                                barcode: item.barcode,
                                expected_qty: item.qty || 0,
                                counted_qty: 0,
                                qty_offset: Math.abs(item.qty || 0),
                                buying_price: item.buying_rate || 0,
                                selling_price: item.selling_rate || 0,
                                is_scanned: 0,
                                scanned: 0,
                                scanned_at: null
                            }));

                            if (!silent) {
                                frappe.show_alert({
                                    message: __('{0} items synchronized', [this.currentInventory.fsm_inventory_item.length]),
                                    indicator: 'green'
                                });
                            }
                        }
                        
                        this.currentPage = 1;
                    } catch (e) {
                        console.error("Erreur lors de la récupération des articles:", e);
                    } finally {
                        this.loadingDetail = false;
                    }
                },

                /**
                 * Loads a specific FSM Inventory document.
                 */
                async selectInventory(inventory) {
                    if (!inventory || !inventory.name) return;
                    
                    this.isSelecting = true;
                    this.loadingDetail = true;
                    try {
                        const response = await frappe.call({
                            method: 'frappe.client.get',
                            args: {
                                doctype: 'FSM Inventory',
                                name: inventory.name
                            }
                        });
                        
                        this.currentInventory = response.message;
                        this.currentPage = 1;
                        
                        // We rely on the watcher to trigger fetchWarehouseItems(true)
                        // if the document has a warehouse but no items.
                    } catch (e) {
                        console.error("Erreur lors de la sélection du document:", e);
                        frappe.msgprint(__('Échec du chargement des détails de l\'inventaire.'));
                    } finally {
                        this.loadingDetail = false;
                        // Use a small timeout to ensure watchers have finished before resetting the flag
                        setTimeout(() => { this.isSelecting = false; }, 100);
                    }
                },

                /**
                 * Initializes a new FSM Inventory record.
                 */
                addInventory() {
                    this.currentInventory = {
                        doctype: 'FSM Inventory',
                        starting_date: frappe.datetime.now_datetime(),
                        end_date: frappe.datetime.now_datetime(),
                        warehouse: '',
                        group: '',
                        inventory_reference: '',
                        buying_price_list: 'Standard Buying',
                        selling_price_list: 'Standard Selling',
                        fsm_inventory_item: [],
                        docstatus: 0
                    };
                    this.currentPage = 1;
                    frappe.show_alert({ message: __('Nouvel inventaire initialisé'), indicator: 'blue' });
                },

				/**
				 * Persists the current inventory record to the database.
				 */
				async saveInventory() {
					if (!this.currentInventory) return;
					
					// Calculate totals before saving
					const items = this.currentInventory.fsm_inventory_item || [];
					let totalExpected = 0;
					let totalCounted = 0;
					let totalOffset = 0;

					items.forEach(item => {
						totalExpected += (parseFloat(item.expected_qty) || 0);
						totalCounted += (parseFloat(item.counted_qty) || 0);
						// Recalculate individual offsets to absolute values if they weren't already
						item.qty_offset = Math.abs((parseFloat(item.counted_qty) || 0) - (parseFloat(item.expected_qty) || 0));
						totalOffset += item.qty_offset;
					});

					// Map values to FSM Inventory fields
					this.currentInventory.total_expected_qty = totalExpected;
					this.currentInventory.total_counted_qty = totalCounted;
					this.currentInventory.total_qty_offset = totalOffset;

					this.loadingDetail = true;
					try {
						let response;
						
						// If it's a new unsaved record, we insert it
						if (!this.currentInventory.name) {
							response = await frappe.call({
								method: 'frappe.client.insert',
								args: {
									doc: this.currentInventory
								}
							});
						} else {
							// Existing record update
							response = await frappe.call({
								method: 'frappe.client.save',
								args: {
									doc: this.currentInventory
								}
							});
						}

						if (response.message) {
							this.currentInventory = response.message;
							await this.loadInventories();
							frappe.show_alert({
								message: __('Inventaire {0} sauvegardé avec succès', [this.currentInventory.name]),
								indicator: 'green'
							});
						}
					} catch (e) {
						console.error("Échec de la sauvegarde:", e);
						frappe.msgprint(__('Échec de la sauvegarde de l\'inventaire.'));
					} finally {
						this.loadingDetail = false;
					}
				},

				/**
				 * Redirects the user to the FSM Inventory DocType page.
				 * Automatically saves the document first.
				 */
				async submitInventory() {
					if (!this.currentInventory) return;

					frappe.confirm(__('Enregistrer les modifications et passer au document système ?'), async () => {
						try {
							// 1. Perform save first
							await this.saveInventory();

							// 2. Only redirect if the save was successful (has a name)
							if (this.currentInventory.name) {
								frappe.set_route('Form', 'FSM Inventory', this.currentInventory.name);

								// Perform a hard refresh after a tiny delay
								setTimeout(() => {
									window.location.reload();
								}, 100);
							}
						} catch (e) {
							console.error("Redirection vers la vue système échouée:", e);
							frappe.msgprint(__('Échec de la sauvegarde avant la redirection.'));
						}
					});
				},

				/**
				 * Returns semantic CSS classes for row highlighting.
				 */
                getQtyClass(offset) {
                    if (offset != 0) return 'text-danger';
                    return '';
                },

                getStatusLabel(docstatus) {
                    return docstatus === 1 ? 'Submitted' : 'Draft';
                },

                getStatusClass(docstatus) {
                    return docstatus === 1 ? 'closed' : 'draft';
                },

                /**
                 * Fetches the list of all inventory records for the sidebar.
                 */
                async loadInventories() {
                    try {
                        const response = await frappe.call({
                            method: 'frappe.client.get_list',
                            args: {
                                doctype: 'FSM Inventory',
                                fields: [
                                    'name',
                                    'warehouse',
                                    'docstatus',
                                    'starting_date',
                                    'end_date',
                                    'stock_reconciliation',
                                    'group',
                                    'total_qty_offset'
                                ],
                                order_by: 'creation desc'
                            }
                        });
                        this.inventories = response.message || [];
                    } catch (e) {
                        console.error("Échec du chargement de la barre latérale:", e);
                        frappe.msgprint('Échec de la récupération de l\'historique des inventaires');
                    }
                }
            }
        }).mount('#inventory-app');
    }

    if (!window.Vue) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/vue@3/dist/vue.global.js';
        script.onload = mount_vue;
        document.head.appendChild(script);
    } else {
        mount_vue();
    }
};