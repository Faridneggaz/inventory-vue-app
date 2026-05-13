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
					currentInventory: null

				}

			},

			async mounted() {

				await this.loadInventories();

			},

			methods: {

				toggleSidebar() { this.sidebarVisible = !this.sidebarVisible; },

				addInventory() {
					this.currentInventory = {
						doctype: 'FSM Inventory',
						starting_date: frappe.datetime.nowdate(),
						end_date: frappe.datetime.nowdate(),
						warehouse: '',
						items: []
					};
					frappe.show_alert({message: __('New Inventory Created'), indicator: 'blue'});
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
						'stock_reconciliation'
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