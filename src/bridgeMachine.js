import { Machine } from "xstate";

export default () => ({
  inventory: new Map(),
  service: null,
  childService: null,
  bridgeDefinition: {
    id: "bridgeMachine",
    initial: "init",
    states: {
      init: {}
    }
  },
  build: function({ definition, config }) {
    const bridgeMachine = Machine(this.bridgeDefinition);
    const machineID = `${definition.id}Bridge`;

    bridgeMachine.onEntry.push({
      type: "external",
      exec: (...args) => {
        console.log("onEntry", args);
        if (this.service) {
          this.service.onTransition(state => {
            if (!state) return;
            state.actions.forEach(action => {
              if (
                action.type === "xstate.stop" &&
                action.activity.id === machineID
              ) {
                console.log("BINGO!!!!");
                this.childService.stop();
              }
            });
          });
          this.childService = this.service.spawnMachine(
            Machine(this.analyze(definition), config),
            { autoForward: true }
            // { sync: true }
            // { sync: true, autoForward: true }
          );
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
