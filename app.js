let globalDFA = {};

// UI Navigation
document.getElementById('btn-setup').addEventListener('click', generateTransitionTable);
document.getElementById('btn-back').addEventListener('click', () => {
    document.getElementById('step2-panel').style.display = 'none';
    document.getElementById('step1-panel').style.display = 'block';
});
document.getElementById('btn-minimize').addEventListener('click', processDFA);

function generateTransitionTable() {
    const errorDiv = document.getElementById('setup-error');
    errorDiv.innerText = "";

    const alphabetStr = document.getElementById('input-alphabet').value;
    const statesStr = document.getElementById('input-states').value;
    const startState = document.getElementById('input-start').value.trim();
    const acceptStr = document.getElementById('input-accept').value;

    const alphabet = alphabetStr.split(',').map(s => s.trim()).filter(s => s);
    const states = statesStr.split(',').map(s => s.trim()).filter(s => s);
    const accept = acceptStr.split(',').map(s => s.trim()).filter(s => s);

    if (alphabet.length === 0 || states.length === 0 || !startState) {
        errorDiv.innerText = "Please fill out all fields. Alphabet, States, and Start State are required.";
        return;
    }

    if (!states.includes(startState)) {
        errorDiv.innerText = `Start state '${startState}' must be in the states list.`;
        return;
    }

    globalDFA = { alphabet, states, start: startState, accept, transitions: {} };

    // Build the table HTML
    const table = document.getElementById('transition-table');
    let html = `<tr><th>State</th>`;
    alphabet.forEach(sym => html += `<th>Input '${sym}'</th>`);
    html += `</tr>`;

    states.forEach(state => {
        let isStart = state === startState ? "→ " : "";
        let isAccept = accept.includes(state) ? "*" : "";
        html += `<tr><td><strong>${isStart}${state}${isAccept}</strong></td>`;
        
        alphabet.forEach(sym => {
            html += `<td><input type="text" id="trans_${state}_${sym}" placeholder="Dest. State"></td>`;
        });
        html += `</tr>`;
    });

    table.innerHTML = html;

    // Switch panels
    document.getElementById('step1-panel').style.display = 'none';
    document.getElementById('step2-panel').style.display = 'block';
    document.getElementById('output-panel').style.display = 'none';
}

function processDFA() {
    const errorDiv = document.getElementById('transition-error');
    errorDiv.innerText = "";

    // Gather transitions from the table
    for (let state of globalDFA.states) {
        globalDFA.transitions[state] = {};
        for (let sym of globalDFA.alphabet) {
            const dest = document.getElementById(`trans_${state}_${sym}`).value.trim();
            if (!dest) {
                errorDiv.innerText = `Incomplete Input: Missing transition for state '${state}' on input '${sym}'.`;
                return;
            }
            if (!globalDFA.states.includes(dest)) {
                errorDiv.innerText = `Invalid Input: Destination state '${dest}' does not exist in your defined states.`;
                return;
            }
            globalDFA.transitions[state][sym] = dest;
        }
    }

    const outputDiv = document.getElementById('partition-output');
    outputDiv.innerHTML = "";
    document.getElementById('output-panel').style.display = 'grid';

    // 1. Draw the Original DFA (including unreachable states)
    drawGraph(globalDFA, 'network-original');

    // 2. Clone the DFA so we don't destroy the original data
    let processingDFA = JSON.parse(JSON.stringify(globalDFA));

    // 3. Remove Unreachable States
    let removedStates = removeUnreachableStates(processingDFA);
    if (removedStates.length > 0) {
        outputDiv.innerHTML += `<strong>Pre-processing:</strong>\nRemoved Unreachable States: {${removedStates.join(', ')}}\n\n`;
    } else {
        outputDiv.innerHTML += `<strong>Pre-processing:</strong>\nNo unreachable states found.\n\n`;
    }

    // 4. Logic: Minimization Process
    let partitions = getInitialPartition(processingDFA);
    outputDiv.innerHTML += `<strong>Initial Partition (P0):</strong>\n${formatPartition(partitions)}\n\n`;

    let changing = true;
    let step = 1;

    while (changing) {
        let newPartitions = refinePartitions(partitions, processingDFA);
        if (JSON.stringify(newPartitions) === JSON.stringify(partitions)) {
            changing = false;
            outputDiv.innerHTML += `<strong>Final Partition (P${step}) - No changes:</strong>\n${formatPartition(newPartitions)}\n\n`;
        } else {
            outputDiv.innerHTML += `<strong>Step Partition (P${step}):</strong>\n${formatPartition(newPartitions)}\n\n`;
            partitions = newPartitions;
            step++;
        }
    }

    // 5. Map Minimized DFA
    let minimizedDFA = buildMinimizedDFA(processingDFA, partitions);
    drawGraph(minimizedDFA, 'network-minimized');
}

// --- NEW FUNCTION: Breadth-First Search to prune dead states ---
function removeUnreachableStates(dfa) {
    let reachable = new Set();
    let queue = [dfa.start];
    reachable.add(dfa.start);

    // BFS to find all reachable states
    while (queue.length > 0) {
        let current = queue.shift();
        for (let sym of dfa.alphabet) {
            let nextState = dfa.transitions[current][sym];
            if (nextState && !reachable.has(nextState)) {
                reachable.add(nextState);
                queue.push(nextState);
            }
        }
    }

    let reachableArray = Array.from(reachable);
    let removedStates = dfa.states.filter(s => !reachable.has(s));

    // Update the DFA object to only include reachable states
    dfa.states = reachableArray;
    dfa.accept = dfa.accept.filter(s => reachable.has(s));

    // Clean up transitions dictionary
    let newTransitions = {};
    for (let state of reachableArray) {
        newTransitions[state] = dfa.transitions[state];
    }
    dfa.transitions = newTransitions;

    return removedStates;
}

function getInitialPartition(dfa) {
    const acceptStates = dfa.accept;
    const nonAcceptStates = dfa.states.filter(s => !acceptStates.includes(s));
    let partitions = [];
    if (nonAcceptStates.length > 0) partitions.push(nonAcceptStates.sort());
    if (acceptStates.length > 0) partitions.push(acceptStates.sort());
    return partitions;
}

function refinePartitions(partitions, dfa) {
    let newPartitions = [];
    partitions.forEach(group => {
        let subgroups = {};
        group.forEach(state => {
            let signature = dfa.alphabet.map(symbol => {
                let targetState = dfa.transitions[state][symbol];
                return getPartitionIndex(targetState, partitions);
            }).join(',');
            if (!subgroups[signature]) subgroups[signature] = [];
            subgroups[signature].push(state);
        });
        Object.values(subgroups).forEach(subgroup => newPartitions.push(subgroup.sort()));
    });
    return newPartitions.sort();
}

function getPartitionIndex(state, partitions) {
    return partitions.findIndex(group => group.includes(state));
}

function formatPartition(partitions) {
    return partitions.map(group => `{${group.join(', ')}}`).join(' , ');
}

function buildMinimizedDFA(originalDfa, finalPartitions) {
    let stateMap = {};
    let minStates = [];
    let minAccept = [];
    let minStart = "";
    
    finalPartitions.forEach(group => {
        let groupName = group.join(','); 
        minStates.push(groupName);
        
        if (group.includes(originalDfa.start)) minStart = groupName;
        if (group.some(s => originalDfa.accept.includes(s))) minAccept.push(groupName);
        
        group.forEach(state => stateMap[state] = groupName);
    });

    let minTransitions = {};
    finalPartitions.forEach(group => {
        let repState = group[0];
        let sourceGroupName = stateMap[repState];
        minTransitions[sourceGroupName] = {};
        
        originalDfa.alphabet.forEach(sym => {
            let targetState = originalDfa.transitions[repState][sym];
            minTransitions[sourceGroupName][sym] = stateMap[targetState];
        });
    });

    return {
        states: minStates,
        alphabet: originalDfa.alphabet,
        start: minStart,
        accept: minAccept,
        transitions: minTransitions
    };
}

// Visualizer Engine
function drawGraph(dfa, containerId) {
    let nodesData = [];
    let edgesData = [];
    let processedEdges = {};

    nodesData.push({
        id: 'start_dummy_node',
        label: 'Start',
        shape: 'text',
        font: { size: 14, color: '#e53e3e', bold: true } 
    });

    edgesData.push({
        from: 'start_dummy_node',
        to: dfa.start,
        arrows: 'to',
        color: { color: '#e53e3e' }, 
        length: 50
    });

    dfa.states.forEach(state => {
        let isAccept = dfa.accept.includes(state);
        
        nodesData.push({
            id: state,
            label: state,
            shape: 'circle', 
            color: { background: 'white', border: '#1a202c' },
            borderWidth: isAccept ? 4 : 2, 
            font: { size: 16, face: 'Tahoma', bold: true },
            margin: 10
        });

        dfa.alphabet.forEach(sym => {
            let target = dfa.transitions[state][sym];
            let edgeId = `${state}-${target}`;
            
            if (processedEdges[edgeId]) {
                processedEdges[edgeId].label += `, ${sym}`;
            } else {
                processedEdges[edgeId] = { 
                    from: state, 
                    to: target, 
                    label: sym, 
                    arrows: 'to', 
                    font: { align: 'horizontal', background: 'white' }, 
                    color: { color: '#4a5568' }, 
                    smooth: { type: 'curvedCW', roundness: 0.2 } 
                };
            }
        });
    });

    edgesData = edgesData.concat(Object.values(processedEdges));

    const container = document.getElementById(containerId);
    const data = { nodes: new vis.DataSet(nodesData), edges: new vis.DataSet(edgesData) };
    const options = {
        physics: { enabled: true, solver: 'repulsion', repulsion: { nodeDistance: 120 } }
    };
    new vis.Network(container, data, options);
}
