import {Machine} from "xstate";

export default () => ({
  counter: 0,
  inventory: new Map(),
  service: null,
  machines: new Map(),
  bridgeDefinition: {
    id: "bridgeMachine",
    initial: "init",
    states: {
      init: {}
    }
  },
  build: function ({definition, config}) {
    const bridgeMachine = Machine(this.bridgeDefinition);
    const machineID = `${definition.id}Bridge${this.counter}`;
    this.counter += 1;
    
    let childService;
    
    const transitionClb = state => {
      if (!state) return;
      state.actions.forEach(action => {
        console.log(action);
        if (
          action.type === "xstate.stop" &&
          this.machines.get(action.activity.id)
        ) {
          console.warn(`Stopping machine: ${action.activity.id}`);
          console.log(this.machines.get(action.activity.id));
          this.machines.get(action.activity.id).stop();
          this.machines.delete(action.activity.id);
        }
      });
    };
    
    bridgeMachine.onEntry.push({
      type: "external",
      exec: (...args) => {
        console.log("onEntry", args);
        if (this.service) {
          this.service.onTransition(transitionClb);
          childService = this.service.spawnMachine(
            Machine(this.analyze(definition), config),
            {autoForward: true}
            // { sync: true }
            // { sync: true, autoForward: true }
          );
          this.machines.set(machineID, childService);
          childService.onTransition(transitionClb);
          console.log(childService);
        }
      }
    });
    
    return {
      id: machineID,
      src: bridgeMachine
    };
  },
  analyze(definition) {
    const def = definition; //todo: deep clone object
    this.updateInvokes(def);
    return def;
  },
  updateInvokes(object) {
    if (object && typeof object === "object")
      Object.keys(object).forEach(key => {
        if (key === "invoke" && object[key].hasOwnProperty("machineID")) {
          const machineDef = this.inventory.get(object[key].machineID);
          if (!machineDef)
            throw new Error(`Machine ${object[key].machineID} not registered`);
          object[key] = this.build(machineDef);
        } else this.updateInvokes(object[key]);
      });
  }
});
