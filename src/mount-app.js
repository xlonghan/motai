import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import './emoji-font.css';

export function mountApp(startupData){
  // Consume once, so startup workspace/cache copies do not stay in root props.
  const takeStartupData=()=>{const data=startupData;startupData=null;return data;};
  return createApp(App,{takeStartupData}).mount('#app');
}
