console.log('Loading inventory app...');

window.start_inventory_app = function() {

	console.log('Inventory app started');

	function mount_vue() {

		Vue.createApp({
			delimiters: ['[[', ']]'],
			data() {

				return {

					inventories: [],
					sidebarVisible: true,
					currentInventory: null,
					loadingDetail: false,

					// System Master Data
					warehouses: [],
					families: [],
					priceLists: []

				}

			},

			async mounted() {

				await Promise.all([
					this.loadInventories(),
					this.loadMasterData()
				]);

			},

			methods: {

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
						console.error("Error loading master data:", e);
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

				isEditable() {
					return this.currentInventory && (this.currentInventory.docstatus === 0 || !this.currentInventory.name);
				},

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
						console.log("Selected Inventory:", this.currentInventory);
					} catch (e) {
						console.error(e);
						frappe.msgprint('Failed to load inventory details');
					} finally {
						// Small delay for better UX
						setTimeout(() => {
							this.loadingDetail = false;
						}, 300);
					}
				},

				addInventory() {
					this.currentInventory = {
						doctype: 'FSM Inventory',
						starting_date: frappe.datetime.now_datetime(),
						end_date: frappe.datetime.now_datetime(),
						warehouse: '',
						group: '',
						buying_price_list: 'Standard Buying',
						selling_price_list: 'Standard Selling',
						fsm_inventory_item: [],
						docstatus: 0
					};
					frappe.show_alert({message: __('New Inventory Created'), indicator: 'blue'});
				},

				async saveInventory() {
					frappe.msgprint('Save logic coming soon...');
				},

				async submitInventory() {
					frappe.msgprint('Submit logic coming soon...');
				},

				getStatusLabel(docstatus) {

		return docstatus === 1
			? 'Submitted'
			: 'Draft';

	},

	getStatusClass(docstatus) {

		return docstatus === 1
			? 'closed'
			: 'draft';

	},

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

			console.log("the response", response);

			this.inventories = response.message || [];

			console.log("the inventories", this.inventories);

		} catch (e) {

			console.error(e);

			frappe.msgprint('Failed to load inventories');

		}

	}

}

		}).mount('#inventory-app');

	}

	if (!window.Vue) {

		const script = document.createElement('script');

		script.src =
			'https://unpkg.com/vue@3/dist/vue.global.js';

		script.onload = mount_vue;

		document.head.appendChild(script);

	} else {

		mount_vue();

	}

};