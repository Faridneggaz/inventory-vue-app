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
                    searchQuery: ''
                }
            },

            async mounted() {
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
                    console.log('Warehouse changed:', val);
                    if (val && this.isEditable()) {
                        this.fetchWarehouseItems();
                    }
                },

                'currentInventory.group'(val) {
                    console.log('Group changed:', val);
                    if (this.currentInventory?.warehouse && this.isEditable()) {
                        this.fetchWarehouseItems();
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
                        console.error("Master data load failure:", e);
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
                 * Increments Counted Qty if a match is found.
                 */
                handleBarcodeScan() {
                    if (!this.searchQuery) return;
                    
                    const code = this.searchQuery.trim();
                    const items = this.currentInventory.fsm_inventory_item || [];
                    
                    // Find item by code or barcode
                    const item = items.find(i => 
                        i.item_code === code || 
                        i.barcode === code
                    );

                    if (item) {
                        item.counted_qty = (item.counted_qty || 0) + 1;
                        item.qty_offset = (item.counted_qty || 0) - (item.expected_qty || 0);
                        
                        frappe.show_alert({
                            message: __('{0}: Counted {1}', [item.item_code, item.counted_qty]),
                            indicator: 'green'
                        });

                        // Clear input for next scan
                        this.searchQuery = '';
                    } else {
                        frappe.show_alert({
                            message: __('Item {0} not found in this list', [code]),
                            indicator: 'orange'
                        });
                    }
                },

                clearSearch() {
                    this.searchQuery = '';
                    this.currentPage = 1;
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
                 * Synchronizes table items with current warehouse/price list configurations.
                 */
                async fetchWarehouseItems() {
                    if (!this.currentInventory.warehouse) return;

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
                        this.currentInventory.fsm_inventory_item = items.map(item => ({
                            item_code: item.item_code,
                            item_name: item.item_name,
                            barcode: item.barcode,
                            expected_qty: item.qty || 0,
                            counted_qty: 0,
                            qty_offset: -(item.qty || 0),
                            buying_price: item.buying_rate || 0,
                            selling_price: item.selling_rate || 0
                        }));

                        this.currentPage = 1;

                        frappe.show_alert({
                            message: __('{0} items synchronized', [this.currentInventory.fsm_inventory_item.length]),
                            indicator: 'green'
                        });
                    } catch (e) {
                        console.error("Synchronization failure:", e);
                        frappe.msgprint('Failed to synchronize warehouse items');
                    } finally {
                        this.loadingDetail = false;
                    }
                },

                /**
                 * Loads a specific FSM Inventory document.
                 */
                async selectInventory(inventory) {
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

                        // Logic for auto-loading items for new/unpopulated drafts
                        if (
                            this.currentInventory.docstatus === 0 &&
                            (!this.currentInventory.fsm_inventory_item ||
                                this.currentInventory.fsm_inventory_item.length === 0)
                        ) {
                            await this.fetchWarehouseItems();
                        }
                        console.log("Active Document:", this.currentInventory);
                    } catch (e) {
                        console.error("Document retrieval error:", e);
                        frappe.msgprint('Failed to load inventory details');
                    } finally {
                        setTimeout(() => { this.loadingDetail = false; }, 300);
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
                    frappe.show_alert({ message: __('New Inventory Initialized'), indicator: 'blue' });
                },

				/**
				 * Persists the current inventory record to the database.
				 */
				async saveInventory() {
					if (!this.currentInventory) return;
					
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
								message: __('Inventory {0} saved successfully', [this.currentInventory.name]),
								indicator: 'green'
							});
						}
					} catch (e) {
						console.error("Save failure:", e);
						frappe.msgprint(__('Failed to save inventory record.'));
					} finally {
						this.loadingDetail = false;
					}
				},

				/**
				 * Submits the current inventory record.
				 */
				async submitInventory() {
					if (!this.currentInventory || !this.currentInventory.name) {
						frappe.msgprint(__('Please save the record before submitting.'));
						return;
					}

					frappe.confirm(__('Are you sure you want to submit this inventory? This action is irreversible.'), async () => {
						this.loadingDetail = true;
						try {
							const response = await frappe.call({
								method: 'frappe.client.submit',
								args: {
									doc: this.currentInventory
								}
							});

							if (response.message) {
								this.currentInventory = response.message;
								await this.loadInventories();
								frappe.show_alert({
									message: __('Inventory {0} submitted successfully', [this.currentInventory.name]),
									indicator: 'blue'
								});
							}
						} catch (e) {
							console.error("Submission failure:", e);
						} finally {
							this.loadingDetail = false;
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
                        console.error("Sidebar load failure:", e);
                        frappe.msgprint('Failed to retrieve inventory history');
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