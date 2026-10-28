import { Component } from '@angular/core';
import { InvoiceListComponent } from './invoice-list.component';

@Component({
  selector: 'app-root',
  imports: [InvoiceListComponent],
  template: '<app-invoice-list />',
})
export class AppComponent {}
